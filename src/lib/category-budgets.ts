import type { CategoryBudget, Event, Prisma } from "../generated/prisma/client";
import { availabilityWindows } from "./availability";
import { addLocalDays, calendarDayBounds, dateOnly, roundUp, startOfLocalWeek, ymdInZone } from "./time";
import { freeMinutes, type Schedulable } from "./scheduler";
export function categoryMinutes(event: Event, start: Date, end: Date) {
  const overlap = Math.max(0, Math.min(end.getTime(), event.endsAt.getTime()) - Math.max(start.getTime(), event.startsAt.getTime()));
  const scheduled = overlap / 60000;
  return event.status === "DONE" && event.actualMinutes != null ? event.actualMinutes * overlap / Math.max(1, event.endsAt.getTime() - event.startsAt.getTime()) : scheduled;
}
export async function weeklyCategoryProgress(tx: Prisma.TransactionClient, userId: string, day: string, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } }), first = startOfLocalWeek(day, user.weekStartsOn);
  const start = calendarDayBounds(first, user.timezone).start, end = calendarDayBounds(addLocalDays(first, 6), user.timezone).end;
  const [categories, events] = await Promise.all([tx.categoryBudget.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }), tx.event.findMany({ where: { userId, categoryId: { not: null }, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: end }, endsAt: { gt: start } } })]);
  return categories.map(category => {
    const blocks = events.filter(event => event.categoryId === category.id);
    const done = blocks.filter(event => event.status === "DONE").reduce((n,e) => n + categoryMinutes(e,start,end),0);
    const reserved = blocks.filter(event => event.status !== "DONE" && (event.endsAt > now || event.status === "IN_PROGRESS")).reduce((n,e) => n + categoryMinutes(e,start,end),0);
    return { ...category, done: Math.round(done), reserved: Math.round(reserved), missing: Math.max(0,Math.ceil(category.weeklyMinutes-done-reserved)), week: first };
  });
}
export async function categoryTargets(tx: Prisma.TransactionClient, userId: string, day: string, now: Date, events: Event[], extraSlack: number) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { availability: true } });
  const first = startOfLocalWeek(day, user.weekStartsOn), last = addLocalDays(first,6), today = ymdInZone(now,user.timezone);
  const bounds = { start: calendarDayBounds(first,user.timezone).start, end: calendarDayBounds(last,user.timezone).end };
  const [categories, weekEvents, overrides] = await Promise.all([
    tx.categoryBudget.findMany({ where: { userId, active: true }, orderBy: { id: "asc" } }),
    tx.event.findMany({ where: { userId, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: bounds.end }, endsAt: { gt: bounds.start } } }),
    tx.dayOverride.findMany({ where: { userId, date: { gte: dateOnly(first), lte: dateOnly(last) } } }),
  ]);
  const capacities: { day: string; minutes: number }[] = [];
  for (let date = first; date <= last; date = addLocalDays(date,1)) {
    if (date < today || date < day) continue;
    const override = overrides.find(o => o.date.getTime() === dateOnly(date).getTime());
    if (override?.paused || override?.essentialOnly) continue;
    let capacity = 0;
    try {
      const windows = availabilityWindows(user,date,user.timezone,override).map(w => ({...w,start:new Date(Math.max(w.start.getTime(),date===today?roundUp(now).getTime():w.start.getTime()))}));
      const occupied = date === day ? events : weekEvents;
      capacity = freeMinutes(windows,occupied,user.bufferMinutes) * (1-Math.min(50,user.slackPercent+extraSlack)/100) * (override?.capacityPercent ?? 100)/100;
    } catch { /* DST-invalid windows cannot receive category reservations. */ }
    capacities.push({day:date,minutes:capacity});
  }
  const total = capacities.reduce((n,d)=>n+d.minutes,0), current = capacities.find(d=>d.day===day)?.minutes ?? 0;
  return categories.map(category => {
    const allocated = weekEvents.filter(e=>e.categoryId===category.id && (e.status === "DONE" || e.status === "IN_PROGRESS" || e.endsAt > now)).reduce((n,e)=>n+categoryMinutes(e,bounds.start,bounds.end),0);
    const remaining = Math.max(0,category.weeklyMinutes-allocated);
    return { category, remaining, todayMinutes: total > 0 ? Math.min(remaining,current,Math.ceil(remaining*current/total/5)*5) : 0 };
  });
}
export function categoryFillItems(category: CategoryBudget, minutes: number): Schedulable[] {
  const items: Schedulable[] = [];
  for (let remaining = minutes, index = 0; remaining >= 5; index++) {
    const durationMinutes = Math.min(60, Math.floor(remaining/5)*5);
    items.push({ key:`category:${category.id}:${String(index).padStart(3,"0")}`, title:category.name, durationMinutes, priority:2, preferredWindow:category.preferredWindow, source:"AUTO", categoryId:category.id, budgetFill:true, categoryWeight:1 });
    remaining -= durationMinutes;
  }
  return items;
}
