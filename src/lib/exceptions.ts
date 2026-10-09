import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { DateSchema, TimeSchema } from "./definitions";
import { addLocalDays, calendarDayBounds, dateOnly, ymdInZone } from "./time";
import { availabilityWindows } from "./availability";
import { DomainError } from "./transaction";
export const ExceptionSchema = z.object({ start: DateSchema, until: DateSchema, label: z.string().trim().max(80), mode: z.enum(["PAUSE", "HOURS"]), startTime: TimeSchema, endTime: TimeSchema }).refine(v => v.until >= v.start && (dateOnly(v.until).getTime() - dateOnly(v.start).getTime()) / 86400000 <= 366 && (v.mode === "PAUSE" || v.startTime < v.endTime), "Revisa fechas y horario.");
export async function clearFlexiblePlans(tx: Prisma.TransactionClient, userId: string, start: string, until: string, timezone: string, now: Date) {
  const bounds = { start: calendarDayBounds(start, timezone).start, end: calendarDayBounds(until, timezone).end };
  const events = await tx.event.findMany({ where: { userId, locked: false, source: { not: "MANUAL" }, status: "PENDING", startsAt: { gte: new Date(Math.max(now.getTime(), bounds.start.getTime())), lt: bounds.end } } });
  // Future generated blocks can be rebuilt; fixed, started and completed blocks stay.
  await tx.event.deleteMany({ where: { userId, id: { in: events.map(e => e.id) } } });
  await tx.task.updateMany({ where: { userId, archived: false, status: "SCHEDULED", id: { in: events.flatMap(e => e.taskId ? [e.taskId] : []) } }, data: { status: "INBOX" } });
  await tx.dayPlan.deleteMany({ where: { userId, date: { gte: dateOnly(start), lte: dateOnly(until) } } });
}
export async function applyException(tx: Prisma.TransactionClient, userId: string, input: z.infer<typeof ExceptionSchema>, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (input.start < ymdInZone(now, user.timezone)) throw new DomainError("Las excepciones se aplican desde hoy.");
  for (let day = input.start; day <= input.until; day = addLocalDays(day, 1)) {
    const data = { label: input.label || null, paused: input.mode === "PAUSE", startTime: input.mode === "HOURS" ? input.startTime : null, endTime: input.mode === "HOURS" ? input.endTime : null, capacityPercent: 100, essentialOnly: false };
    if (input.mode === "HOURS") {
      try { availabilityWindows({ ...user, availability: [] }, day, user.timezone, data); }
      catch (error) { throw new DomainError(`La fecha ${day}: ${error instanceof Error ? error.message : "Horario inválido."}`); }
    }
    await tx.dayOverride.upsert({ where: { userId_date: { userId, date: dateOnly(day) } }, create: { userId, date: dateOnly(day), ...data }, update: data });
  }
  await clearFlexiblePlans(tx, userId, input.start, input.until, user.timezone, now);
}
