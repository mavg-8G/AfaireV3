import { createHash } from "node:crypto";
import { z } from "zod";
import { EventFormSchema, TimezoneSchema } from "./definitions";
import { ownedEvent, parseEvent, assertFree, setEventStatus } from "./calendar";
import { DomainError } from "./transaction";
import type { Prisma } from "@prisma/client";

export const OFFLINE_MAX_AGE_MS = 7 * 86400_000;
const common = {
  id: z.uuid(), owner: z.string().min(1).max(100), deviceSessionId: z.string().min(1).max(100), sessionVersion: z.number().int().min(0),
  eventId: z.string().min(1).max(100), expectedUpdatedAt: z.iso.datetime(), recordedAt: z.iso.datetime(), timezone: TimezoneSchema,
};
export const OfflineChangeSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("STATUS"), status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "SKIPPED", "CANCELLED"]) }).strict(),
  z.object({ ...common, kind: z.literal("EDIT"), edit: EventFormSchema.strict() }).strict(),
]);
export type OfflineChange = z.infer<typeof OfflineChangeSchema>;
export class OfflineSessionError extends DomainError {}
export class OfflineConflict extends DomainError {}

export async function applyOfflineChange(tx: Prisma.TransactionClient, actor: { id: string; currentSessionId: string; sessionVersion: number }, change: OfflineChange, now = new Date()) {
  if (change.owner !== actor.id || change.deviceSessionId !== actor.currentSessionId || change.sessionVersion !== actor.sessionVersion) throw new OfflineSessionError("La cola pertenece a otra sesión. Se eliminará de este dispositivo.");
  const device = await tx.deviceSession.findFirst({ where: { id: actor.currentSessionId, userId: actor.id, revokedAt: null, expiresAt: { gt: now }, user: { sessionVersion: actor.sessionVersion } } });
  if (!device) throw new OfflineSessionError("Tu sesión caducó. Inicia sesión de nuevo.");
  const recordedAt = new Date(change.recordedAt);
  if (recordedAt.getTime() > now.getTime() + 60_000 || now.getTime() - recordedAt.getTime() > OFFLINE_MAX_AGE_MS) throw new OfflineConflict("El cambio es demasiado antiguo o el reloj del dispositivo no coincide. Revísalo con conexión.");
  const payloadHash = createHash("sha256").update(JSON.stringify(change)).digest("hex");
  const receipt = await tx.offlineMutation.findUnique({ where: { userId_id: { userId: actor.id, id: change.id } } });
  if (receipt) {
    if (receipt.payloadHash !== payloadHash) throw new OfflineConflict("El identificador ya se usó para otro cambio.");
    return { eventId: receipt.eventId, updatedAt: receipt.eventUpdatedAt.toISOString(), duplicate: true };
  }
  const event = await ownedEvent(tx, actor.id, change.eventId);
  if (event.updatedAt.toISOString() !== change.expectedUpdatedAt) throw new OfflineConflict("Este bloque cambió en el servidor. Descarta el cambio pendiente y revisa la versión actual.");
  if (["CANCELLED", "SKIPPED"].includes(event.status)) throw new OfflineConflict("Este bloque ya fue retirado en el servidor.");
  if (change.kind === "STATUS") {
    if (event.status === "DONE" && change.status !== "PENDING") throw new OfflineConflict("Este bloque ya está completado. Reábrelo antes de cambiar su estado.");
    if (event.startedAt && ["DONE", "IN_PROGRESS"].includes(change.status) && recordedAt < event.startedAt) throw new OfflineConflict("El cambio es anterior al inicio del bloque. Comprueba el reloj del dispositivo.");
    await setEventStatus(tx, actor.id, event.id, change.status, { now: recordedAt });
  } else {
    const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { timezone: true } });
    if (user.timezone !== change.timezone) throw new OfflineConflict("La zona horaria cambió. Revisa el horario con conexión.");
    const form = new FormData(); for (const [key, value] of Object.entries(change.edit)) if (value != null) form.set(key, String(value));
    const data = parseEvent(form, user.timezone);
    if (event.occurrenceId && event.planningDate?.getTime() !== data.planningDate.getTime()) throw new OfflineConflict("Un hábito pertenece a su día. Puedes mover su hora, pero no su fecha.");
    if (data.startsAt.getTime() !== event.startsAt.getTime() && data.startsAt < now) throw new OfflineConflict("El nuevo horario ya pasó. Elige un horario futuro con conexión.");
    await assertFree(tx, actor.id, data.startsAt, data.endsAt, event.id, data.travelMinutes);
    await tx.event.update({ where: { id: event.id }, data: { ...data, locked: true, recoveryMinutes: 0, planningReason: "Horario elegido manualmente y fijado por ti." } });
  }
  const updated = await tx.event.findUniqueOrThrow({ where: { id: event.id }, select: { updatedAt: true } });
  await tx.offlineMutation.create({ data: { userId: actor.id, id: change.id, eventId: event.id, payloadHash, eventUpdatedAt: updated.updatedAt, appliedAt: now } });
  return { eventId: event.id, updatedAt: updated.updatedAt.toISOString(), duplicate: false };
}
