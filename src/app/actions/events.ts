"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { z } from "zod";
import { DateSchema } from "@/lib/definitions";
import { addLocalDays, dateOnly, formatTime, ymdInZone } from "@/lib/time";
import { insertSeries, replaceFollowingSeries } from "@/lib/series";
import { assertFree, ownedEvent, parseEvent, setEventStatus } from "@/lib/calendar";
import type { EventStatus } from "@prisma/client";
import type { ActionResult } from "@/lib/definitions";

function refresh() { revalidatePath("/"); revalidatePath("/week"); revalidatePath("/inbox"); revalidatePath("/review"); revalidatePath("/habits"); }
export async function createLockedEvent(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const data = parseEvent(formData, user.timezone);
      const recurrence = parseRecurrence(formData, data.startsAt, data.endsAt, user.timezone);
      if (recurrence) {
        const series = await tx.eventSeries.create({ data: { title: data.title, notes: data.notes, location: data.location, travelMinutes: data.travelMinutes, userId: user.id, ...recurrence } });
        await insertSeries(tx, series);
      } else {
        await assertFree(tx, user.id, data.startsAt, data.endsAt, undefined, data.travelMinutes);
        await tx.event.create({ data: { ...data, userId: user.id, locked: true, source: "MANUAL" } });
      }
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function updateEventTimes(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["SKIPPED", "CANCELLED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      const data = parseEvent(formData, user.timezone);
      if (event.occurrenceId && event.planningDate?.getTime() !== data.planningDate.getTime()) throw new DomainError("Un hábito pertenece a su día. Puedes mover su hora, pero no su fecha.");
      if (formData.get("scope") === "FOLLOWING") {
        const rule = parseRecurrence(formData, data.startsAt, data.endsAt, user.timezone);
        if (!rule) throw new DomainError("Selecciona cómo se repite la serie.");
        await replaceFollowingSeries(tx, user.id, event.id, { ...rule, title: data.title, notes: data.notes, location: data.location, travelMinutes: data.travelMinutes }); return;
      }
      await assertFree(tx, user.id, data.startsAt, data.endsAt, id, data.travelMinutes);
      await tx.event.update({ where: { id }, data: { ...data, locked: true, recoveryMinutes: 0, planningReason: "Horario elegido manualmente y fijado por ti." } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function toggleEventDone(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      await setEventStatus(tx, user.id, id, event.status === "DONE" ? "PENDING" : "DONE");
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function changeEventStatus(id: string, status: EventStatus) {
  const user = await requireUser();
  try {
    if (!["IN_PROGRESS", "SKIPPED", "PENDING"].includes(status)) throw new DomainError("Estado inválido.");
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "DONE", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya terminó.");
      await setEventStatus(tx, user.id, id, status);
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function lockEvent(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      await tx.event.update({ where: { id }, data: { locked: true, planningReason: "Horario fijado por ti; el planificador conserva este bloque." } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function deleteEvent(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => { await setEventStatus(tx, user.id, id, "CANCELLED"); });
    refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}

function parseRecurrence(formData: FormData, startsAt: Date, endsAt: Date, timezone: string) {
  const frequency = formData.get("frequency") ?? "NONE";
  if (frequency === "NONE") return null;
  const parsed = z.object({ frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]), until: DateSchema, weekdays: z.array(z.coerce.number().int().min(0).max(6)) }).safeParse({ frequency, until: formData.get("until"), weekdays: formData.getAll("weekdays") });
  if (!parsed.success) throw new DomainError("Revisa la repetición, los días y la fecha final.");
  const startDate = ymdInZone(startsAt, timezone);
  if (parsed.data.until < startDate || (dateOnly(parsed.data.until).getTime() - dateOnly(startDate).getTime()) / 86400_000 > 366) throw new DomainError("La repetición admite hasta 366 días desde la fecha inicial.");
  if (parsed.data.frequency === "WEEKLY" && !parsed.data.weekdays.length) throw new DomainError("Elige al menos un día de la semana.");
  return { frequency: parsed.data.frequency, weekdays: [...new Set(parsed.data.weekdays)], until: dateOnly(parsed.data.until), startDate: dateOnly(startDate), timezone, startTime: formatTime(startsAt, timezone), endTime: formatTime(endsAt, timezone), endDayOffset: Math.round((dateOnly(ymdInZone(endsAt, timezone)).getTime() - dateOnly(startDate).getTime()) / 86400_000) };
}
export async function deleteFollowingEvents(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (!event.seriesId || !event.recurrenceDate) throw new DomainError("Este evento no pertenece a una serie.");
      await tx.eventSeries.updateMany({ where: { id: event.seriesId, userId: user.id }, data: { until: dateOnly(addLocalDays(event.recurrenceDate.toISOString().slice(0, 10), -1)) } });
      await tx.event.updateMany({ where: { userId: user.id, seriesId: event.seriesId, recurrenceDate: { gte: event.recurrenceDate }, status: { in: ["PENDING", "SKIPPED"] } }, data: { status: "CANCELLED" } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function saveActualMinutes(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const minutes = z.coerce.number().int().min(1).max(480).safeParse(formData.get("actualMinutes"));
    if (!minutes.success) throw new DomainError("Introduce entre 1 y 480 minutos reales.");
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (event.status !== "DONE") throw new DomainError("Completa el bloque antes de registrar su duración real.");
      await tx.event.update({ where: { id }, data: { actualMinutes: minutes.data } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
