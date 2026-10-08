import type { Prisma, EventStatus } from "@prisma/client";
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
  return { title: parsed.data.title, startsAt, endsAt, notes: parsed.data.notes || null, planningDate: dateOnly(parsed.data.date) };
}
export async function assertFree(tx: Prisma.TransactionClient, userId: string, startsAt: Date, endsAt: Date, ignoreId?: string) {
  const overlap = await tx.event.findFirst({ where: {
    userId, ...(ignoreId ? { id: { not: ignoreId } } : {}),
    status: { notIn: ["SKIPPED", "CANCELLED"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
  } });
  if (overlap) throw new DomainError(`El horario coincide con «${overlap.title}». Mueve o quita ese bloque primero.`);
}
export async function ownedEvent(tx: Prisma.TransactionClient, userId: string, id: string) {
  const event = await tx.event.findFirst({ where: { id, userId } });
  if (!event) throw new DomainError("Evento no encontrado.");
  return event;
}
export async function setEventStatus(tx: Prisma.TransactionClient, userId: string, id: string, status: EventStatus) {
  const event = await ownedEvent(tx, userId, id);
  if (status === "PENDING") await assertFree(tx, userId, event.startsAt, event.endsAt, id);
  await tx.event.update({ where: { id }, data: { status } });
  if (event.occurrenceId) await tx.habitOccurrence.updateMany({ where: { id: event.occurrenceId, userId }, data: { status: status === "CANCELLED" ? "SKIPPED" : status } });
  if (event.taskId) await tx.task.updateMany({ where: { id: event.taskId, userId, archived: false }, data: { status: status === "DONE" || (event.status === "DONE" && status === "CANCELLED") ? "DONE" : ["CANCELLED", "SKIPPED"].includes(status) ? "INBOX" : "SCHEDULED" } });
}
