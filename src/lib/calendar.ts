import type { Prisma, EventStatus } from "@prisma/client";
import { recordPostponement } from "./procrastination";
import { DomainError } from "./transaction";
import { combineLocalDateTime, dateOnly } from "./time";
import { EventFormSchema } from "./definitions";

export function parseEvent(formData: FormData, timezone: string) {
  const parsed = EventFormSchema.safeParse({
    ...Object.fromEntries(formData), endDate: formData.get("endDate") || undefined,
  });
  if (!parsed.success) throw new DomainError("Revisa el título, la fecha y las horas.");
  let startsAt: Date; let endsAt: Date;
  try {
    startsAt = combineLocalDateTime(parsed.data.date, parsed.data.startTime, timezone);
    endsAt = combineLocalDateTime(parsed.data.endDate ?? parsed.data.date, parsed.data.endTime, timezone);
  } catch (error) { throw new DomainError(error instanceof Error ? error.message : "Horario inválido."); }
  if (endsAt <= startsAt) throw new DomainError("El fin debe ser posterior al inicio. Para una cita nocturna, cambia la fecha final.");
  if (endsAt.getTime() - startsAt.getTime() > 7 * 86400_000) throw new DomainError("Una cita puede durar como máximo 7 días.");
  return { title: parsed.data.title, startsAt, endsAt, notes: parsed.data.notes || null, location: parsed.data.location || null, travelMinutes: parsed.data.location ? parsed.data.travelMinutes : 0, planningDate: dateOnly(parsed.data.date) };
}
export async function assertFree(tx: Prisma.TransactionClient, userId: string, startsAt: Date, endsAt: Date, ignoreId?: string, travelMinutes = 0) {
  const candidates = await tx.event.findMany({ where: {
    userId, ...(ignoreId ? { id: { not: ignoreId } } : {}),
    status: { notIn: ["SKIPPED", "CANCELLED"] }, startsAt: { lt: new Date(endsAt.getTime() + 180 * 60_000) }, endsAt: { gt: new Date(startsAt.getTime() - 180 * 60_000) },
  } });
  const overlap = candidates.find(event => event.startsAt.getTime() - event.travelMinutes * 60_000 < endsAt.getTime() && event.endsAt.getTime() > startsAt.getTime() - travelMinutes * 60_000);
  if (overlap) throw new DomainError(`El horario coincide con «${overlap.title}». Mueve o quita ese bloque primero.`);
}
export async function ownedEvent(tx: Prisma.TransactionClient, userId: string, id: string) {
  const event = await tx.event.findFirst({ where: { id, userId } });
  if (!event) throw new DomainError("Evento no encontrado.");
  return event;
}
export async function setEventStatus(tx: Prisma.TransactionClient, userId: string, id: string, status: EventStatus, options: { now?: Date; postpone?: boolean } = {}) {
  const now = options.now ?? new Date();
  const event = await ownedEvent(tx, userId, id);
  if (status === "SKIPPED" || options.postpone) await recordPostponement(tx, event, now);
  if (status === "PENDING") await assertFree(tx, userId, event.startsAt, event.endsAt, id, event.travelMinutes);
  await tx.event.update({ where: { id }, data: { status, ...(status === "IN_PROGRESS" ? { startedAt: event.startedAt ?? now, actualMinutes: null } : status === "DONE" && event.startedAt ? { actualMinutes: Math.max(1, Math.min(480, Math.round((now.getTime() - event.startedAt.getTime()) / 60_000))) } : status === "PENDING" ? { startedAt: null, actualMinutes: null } : {}) } });
  if (event.occurrenceId) await tx.habitOccurrence.updateMany({ where: { id: event.occurrenceId, userId }, data: { status: status === "CANCELLED" ? "SKIPPED" : status } });
  if (event.taskId) {
    const task = await tx.task.findFirst({ where: { id: event.taskId, userId, archived: false }, include: { events: { where: { status: { in: ["DONE", "PENDING", "IN_PROGRESS"] } } } } });
    if (task) {
      const active = task.events.some(e => e.status !== "DONE");
      const completed = task.events.filter(e => e.status === "DONE");
      const minutes = completed.reduce((total,e) => total + (e.estimatedMinutes ?? (e.endsAt.getTime() - e.startsAt.getTime()) / 60000), 0);
      const fragmented = task.splittable || event.chunkIndex != null || task.events.some(e => e.chunkIndex != null);
      const done = !active && (fragmented ? minutes >= task.durationMinutes : completed.length > 0 || event.status === "DONE" && status === "CANCELLED");
      await tx.task.update({ where: { id: task.id }, data: { status: done ? "DONE" : active ? "SCHEDULED" : "INBOX" } });
    }
  }
}
