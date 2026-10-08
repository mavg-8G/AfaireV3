import type { Prisma, EventSeries } from "@prisma/client";
import { addLocalDays, dateOnly } from "./time";
import { assertFree, ownedEvent } from "./calendar";
import { DomainError } from "./transaction";
import { recurrenceInstances } from "./recurrence";

export async function insertSeries(tx: Prisma.TransactionClient, series: EventSeries) {
  let instances;
  try {
    instances = recurrenceInstances({ ...series, startDate: series.startDate.toISOString().slice(0, 10), until: series.until.toISOString().slice(0, 10), frequency: series.frequency as "DAILY" | "WEEKLY" | "MONTHLY" });
  } catch (error) { throw new DomainError(error instanceof Error ? error.message : "Repetición inválida."); }
  if (!instances.length) throw new DomainError("No hay ocurrencias entre esas fechas. Revisa los días seleccionados.");
  for (const instance of instances) {
    try { await assertFree(tx, series.userId, instance.startsAt, instance.endsAt, undefined, series.travelMinutes); } catch (error) { if (error instanceof DomainError) throw new DomainError(`La cita del ${instance.recurrenceDate.toISOString().slice(0, 10)}: ${error.message}`); throw error; }
    await tx.event.create({ data: { ...instance, userId: series.userId, seriesId: series.id, title: series.title, notes: series.notes, location: series.location, travelMinutes: series.travelMinutes, source: "MANUAL", locked: true } });
  }
}

export async function replaceFollowingSeries(tx: Prisma.TransactionClient, userId: string, id: string, data: Omit<Prisma.EventSeriesUncheckedCreateInput, "userId" | "id">) {
  const event = await ownedEvent(tx, userId, id);
  if (!event.seriesId || !event.recurrenceDate) throw new DomainError("Este evento no pertenece a una serie.");
  const future = await tx.event.findMany({ where: { userId, seriesId: event.seriesId, recurrenceDate: { gte: event.recurrenceDate } } });
  if (future.some(e => ["DONE", "IN_PROGRESS"].includes(e.status))) throw new DomainError("Hay bloques completados o en curso en esta parte de la serie. Edita solo esta cita.");
  await tx.event.updateMany({ where: { userId, id: { in: future.map(e => e.id) } }, data: { status: "CANCELLED" } });
  await tx.eventSeries.updateMany({ where: { id: event.seriesId, userId }, data: { until: dateOnly(addLocalDays(event.recurrenceDate.toISOString().slice(0, 10), -1)) } });
  const next = await tx.eventSeries.create({ data: { ...data, userId } });
  await insertSeries(tx, next);
  return next;
}
