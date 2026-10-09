import type { PlanFeedback, Prisma, PreferredWindow } from "@prisma/client";
import { calendarDayBounds, dateOnly, addLocalDays, ymdInZone } from "./time";
import { DomainError } from "./transaction";
import { ownedEvent, setEventStatus } from "./calendar";
import { z } from "zod";
export function feedbackPolicy(rows: PlanFeedback[]) {
  const overloaded = new Set(rows.filter(r => r.reason === "OVERLOADED").map(r => r.date.toISOString().slice(0, 10))).size;
  const preferred = rows.filter(r => r.reason === "BAD_TIME" && r.preferredWindow).sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.preferredWindow;
  return { extraSlack: Math.min(20, overloaded * 5), preferredWindow: preferred };
}
export function feedbackDuration(base: number, rows: PlanFeedback[], taskId?: string, habitId?: string, baseline = base) {
  const row = rows.filter(r => r.reason === "ESTIMATE" && r.suggestedMinutes && ((taskId && r.taskId === taskId) || (habitId && r.habitId === habitId))).sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return row ? Math.max(5, Math.ceil(baseline * .75), Math.min(480, Math.floor(baseline * 1.25), Math.round(Math.max(baseline * .75, Math.min(baseline * 1.25, row.suggestedMinutes!)) / 5) * 5)) : base;
}
export const FeedbackSchema = z.object({ reason: z.enum(["OVERLOADED", "BAD_TIME", "ESTIMATE"]), preferredWindow: z.enum(["MORNING", "AFTERNOON", "EVENING", "ANY"]).optional(), eventId: z.string().max(100).optional(), suggestedMinutes: z.coerce.number().int().min(5).max(480).optional() });
export async function storeFeedback(tx: Prisma.TransactionClient, userId: string, day: string, input: z.infer<typeof FeedbackSchema>, now = new Date(), source = "EXPLICIT") {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const today = ymdInZone(now, user.timezone);
  if (day > today || day < addLocalDays(today, -28)) throw new DomainError("Elige hoy o uno de los últimos 28 días.");
  let taskId: string | null = null, habitId: string | null = null;
  if (input.reason === "BAD_TIME" && (!input.preferredWindow || input.preferredWindow === "ANY")) throw new DomainError("Elige la franja que te habría servido mejor.");
  if (input.reason === "ESTIMATE") {
    if (!input.eventId || !input.suggestedMinutes) throw new DomainError("Elige un bloque y la duración que necesitabas.");
    const event = await ownedEvent(tx, userId, input.eventId), bounds = calendarDayBounds(day, user.timezone);
    if (event.startsAt >= bounds.end || event.endsAt <= bounds.start || (!event.taskId && !event.habitId)) throw new DomainError("Elige una tarea o un hábito de este día.");
    taskId = event.taskId; habitId = event.habitId;
  }
  const previous = await tx.planFeedback.findUnique({ where: { userId_date_reason: { userId, date: dateOnly(day), reason: input.reason } } });
  if (source === "CHECK_IN" && previous?.source === "EXPLICIT") return;
  const data = { source, preferredWindow: input.reason === "BAD_TIME" ? input.preferredWindow as PreferredWindow : null, taskId, habitId, suggestedMinutes: input.reason === "ESTIMATE" ? input.suggestedMinutes : null, updatedAt: now };
  await tx.planFeedback.upsert({ where: { userId_date_reason: { userId, date: dateOnly(day), reason: input.reason } }, create: { userId, date: dateOnly(day), reason: input.reason, ...data }, update: data });
}
export const CheckInSchema = z.object({ mood: z.enum(["OK", "BUSY", "DIFFICULT"]), note: z.string().trim().max(500), learn: z.boolean(), rows: z.array(z.object({ id: z.string().max(100), updatedAt: z.string().datetime(), decision: z.enum(["KEEP", "DONE", "POSTPONE", "SKIP"]), actualMinutes: z.number().int().min(1).max(480).optional() })).max(500) });
export async function closeDay(tx: Prisma.TransactionClient, userId: string, day: string, input: z.infer<typeof CheckInSchema>, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } }), today = ymdInZone(now, user.timezone);
  if (day > today || day < addLocalDays(today, -28)) throw new DomainError("Elige hoy o uno de los últimos 28 días.");
  if (new Set(input.rows.map(row => row.id)).size !== input.rows.length) throw new DomainError("Hay bloques repetidos en el chequeo.");
  const bounds = calendarDayBounds(day, user.timezone); let resolved = 0;
  for (const row of input.rows) {
    const event = await ownedEvent(tx, userId, row.id);
    if (event.startsAt >= bounds.end || event.endsAt <= bounds.start) throw new DomainError("Este bloque no pertenece al día revisado.");
    if (row.decision === "KEEP") continue;
    if (event.updatedAt.toISOString() !== row.updatedAt || !["PENDING", "IN_PROGRESS"].includes(event.status)) throw new DomainError("Un bloque cambió mientras revisabas el día. Actualiza antes de guardar.");
    await setEventStatus(tx, userId, event.id, row.decision === "DONE" ? "DONE" : "SKIPPED", { now });
    if (row.decision === "DONE" && row.actualMinutes) await tx.event.update({ where: { id: event.id }, data: { actualMinutes: row.actualMinutes } });
    if (row.decision !== "DONE" && event.taskId) {
      const task = await tx.task.findUniqueOrThrow({ where: { id: event.taskId } });
      const tomorrow = dateOnly(addLocalDays(today, 1));
      if (!task.seriesId || !task.dueDate || task.dueDate >= tomorrow) await tx.task.update({ where: { id: event.taskId }, data: { availableFrom: tomorrow } });
    }
    resolved++;
  }
  const data = { mood: input.mood, note: input.note || null, resolved, updatedAt: now };
  await tx.dayCheckIn.upsert({ where: { userId_date: { userId, date: dateOnly(day) } }, create: { userId, date: dateOnly(day), ...data }, update: data });
  if (input.learn && input.mood !== "OK") await storeFeedback(tx, userId, day, { reason: "OVERLOADED" }, now, "CHECK_IN");
  else await tx.planFeedback.deleteMany({ where: { userId, date: dateOnly(day), reason: "OVERLOADED", source: "CHECK_IN" } });
  return { resolved };
}
