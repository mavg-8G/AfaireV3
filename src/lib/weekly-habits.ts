import type { Habit, Prisma, User, Availability } from "@prisma/client";
import { availabilityWindows } from "./availability";
import { startOfLocalWeek, addLocalDays, dateOnly, calendarDayBounds, preferredBounds, roundUp } from "./time";
import { freeMinutes, habitToSchedulable, scheduleInWindows } from "./scheduler";
export function chooseWeeklyDays(target: number, used: string[], candidates: { day: string; minutes: number; fits: boolean }[]) {
  return candidates.filter(c => c.fits && !used.includes(c.day)).sort((a,b) => b.minutes - a.minutes || a.day.localeCompare(b.day)).slice(0, Math.max(0, target - used.length)).map(c => c.day);
}
export async function weeklyHabitDue(tx: Prisma.TransactionClient, user: User & { availability: Availability[] }, habit: Habit, day: string, now: Date) {
  const monday = startOfLocalWeek(day, user.weekStartsOn), sunday = addLocalDays(monday, 6);
  const occurrences = await tx.habitOccurrence.findMany({ where: { userId: user.id, habitId: habit.id, date: { gte: dateOnly(monday), lte: dateOnly(sunday) } }, include: { event: true } });
  const used = occurrences.filter(o => o.status === "DONE" || o.status === "IN_PROGRESS" || (o.event && ["PENDING", "IN_PROGRESS", "DONE"].includes(o.event.status))).map(o => o.date.toISOString().slice(0,10));
  if (used.length >= habit.weeklyTarget) return false;
  const candidates = [];
  for (let current = day; current <= sunday; current = addLocalDays(current, 1)) {
    if (occurrences.some(o => o.date.getTime() === dateOnly(current).getTime() && ["SKIPPED", "CANCELLED"].includes(o.status))) continue;
    const override = await tx.dayOverride.findUnique({ where: { userId_date: { userId: user.id, date: dateOnly(current) } } });
    if (override?.essentialOnly && !habit.required) continue;
    let windows;
    try { windows = availabilityWindows(user, current, user.timezone, override).map(w => ({ ...w, start: new Date(Math.max(w.start.getTime(), roundUp(now).getTime())) })).filter(w => w.end > w.start); } catch { continue; }
    const bounds = calendarDayBounds(current, user.timezone);
    const busy = await tx.event.findMany({ where: { userId: user.id, status: { notIn: ["SKIPPED", "CANCELLED"] }, startsAt: { lt: new Date(bounds.end.getTime() + (user.bufferMinutes + 180) * 60000) }, endsAt: { gt: new Date(bounds.start.getTime() - (user.bufferMinutes + 180) * 60000) } } });
    const minutes = freeMinutes(windows, busy, user.bufferMinutes) * (1 - user.slackPercent / 100) * (override?.capacityPercent ?? 100) / 100;
    const result = scheduleInWindows(windows, busy, [{ ...habitToSchedulable(habit), preferred: preferredBounds(current, user.timezone, habit.preferredWindow) }], user.bufferMinutes, { maxMinutes: minutes, longBlockMinutes: user.longBlockMinutes, recoveryMinutes: user.recoveryMinutes });
    candidates.push({ day: current, minutes, fits: result.placements.length > 0 });
  }
  return chooseWeeklyDays(habit.weeklyTarget, used, candidates).includes(day);
}

export async function clearPendingHabitBlocks(tx: Prisma.TransactionClient, userId:string, habitId:string, now=new Date()) {
  const blocks=await tx.event.findMany({where:{userId,habitId,locked:false,status:"PENDING",startsAt:{gt:now}}});
  await tx.event.deleteMany({where:{userId,id:{in:blocks.map(e=>e.id)}}});
  await tx.dayPlan.deleteMany({where:{userId,date:{in:blocks.flatMap(e=>e.planningDate?[e.planningDate]:[])}}});
}
