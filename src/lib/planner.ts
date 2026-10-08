import { Prisma } from "@prisma/client";
import { adjustedDuration, learnedFocus } from "./insights";
import { prisma } from "./prisma";
import { DateSchema } from "./definitions";
import { withUserLock, DomainError } from "./transaction";
import { calendarDayBounds, dateOnly, preferredBounds, roundUp, weekdayForDate, ymdInZone, addMinutesUtc } from "./time";
import { availabilityWindows } from "./availability";
import { habitToSchedulable, taskToSchedulable, scheduleInWindows, type Schedulable } from "./scheduler";

export type Unscheduled = { key: string; title: string; reason: string; required: boolean };
export async function generateDay(userId: string, requestedDay?: string, options: { now?: Date; onlyIfMissing?: boolean; recordWorkerRun?: boolean } = {}) {
  const now = options.now ?? new Date();
  return withUserLock(userId, async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { availability: true } });
    const today = ymdInZone(now, user.timezone);
    const day = DateSchema.parse(requestedDay ?? today);
    if (day < today) throw new DomainError("Solo puedes planificar hoy o una fecha futura.");
    const date = dateOnly(day);
    const existingPlan = await tx.dayPlan.findUnique({ where: { userId_date: { userId, date } } });
    if (options.onlyIfMissing && existingPlan) return { placed: 0, skipped: existingPlan.skipped, alreadyPlanned: true };
    const weekday = weekdayForDate(day);
    const windows = availabilityWindows(user, day, user.timezone);
    if (!windows.length) throw new DomainError("Este día no tiene disponibilidad. Actívalo en Ajustes.");
    const calendar = calendarDayBounds(day, user.timezone);
    const todayCalendar = calendarDayBounds(today, user.timezone);
    const start = new Date(Math.max(windows[0].start.getTime(), day === today ? roundUp(now).getTime() : windows[0].start.getTime()));
    const remainingWindows = windows.map(window => ({ ...window, start: new Date(Math.max(start.getTime(), window.start.getTime())) })).filter(window => window.end > window.start);

    // A pending task from a previous day can be released without copying its identity.
    if (user.carryOver) {
      const expired = await tx.event.findMany({ where: { userId, source: "AUTO", locked: false, status: "PENDING", taskId: { not: null }, endsAt: { lte: todayCalendar.start } } });
      if (expired.length) {
        await tx.event.updateMany({ where: { userId, id: { in: expired.map(event => event.id) } }, data: { status: "CANCELLED" } });
        await tx.task.updateMany({ where: { userId, archived: false, status: "SCHEDULED", id: { in: expired.map(event => event.taskId!) } }, data: { status: "INBOX" } });
      }
    }
    const events = await tx.event.findMany({ where: { userId, OR: [
      { startsAt: { lt: addMinutesUtc(calendar.end, user.bufferMinutes + 180) }, endsAt: { gt: addMinutesUtc(calendar.start, -user.bufferMinutes - 180) } },
      { planningDate: date },
    ] } });
    const replaceable = events.filter(event => event.planningDate?.getTime() === date.getTime() && !event.locked && event.source !== "MANUAL" && event.status === "PENDING" && event.startsAt >= start);
    const replacementIds = new Set(replaceable.map(event => event.id));
    const protectedEvents = events.filter(event => !replacementIds.has(event.id) && !["CANCELLED", "SKIPPED"].includes(event.status));
    // Replace only future generated blocks, and reset their linked tasks atomically.
    if (replaceable.length) {
      await tx.event.deleteMany({ where: { userId, id: { in: [...replacementIds] } } });
      await tx.task.updateMany({ where: { userId, archived: false, status: "SCHEDULED", id: { in: replaceable.flatMap(event => event.taskId ? [event.taskId] : []) } }, data: { status: "INBOX" } });
    }
    const history = user.adaptiveDurations ? await tx.event.findMany({ where: { userId, status: "DONE", actualMinutes: { not: null } }, orderBy: { startsAt: "asc" }, include: { task: true } }) : [];
    const focus = user.focusWindow === "LEARNED" ? learnedFocus(await tx.usageSample.findMany({ where: { userId, timezone: user.timezone, observedAt: { gte: new Date(now.getTime() - 28 * 86400_000) } } }), "MORNING") : user.focusWindow;
    const habits = await tx.habit.findMany({ where: { userId, active: true, archived: false, daysOfWeek: { has: weekday } }, orderBy: { id: "asc" } });
    const items: Schedulable[] = [];
    for (const habit of habits) {
      const occurrence = await tx.habitOccurrence.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        create: { userId, habitId: habit.id, date },
        update: {},
        include: { event: true },
      });
      if (occurrence.status !== "PENDING" || occurrence.event) continue;
      items.push({ ...habitToSchedulable(habit), durationMinutes: adjustedDuration(habit.durationMinutes, history.filter(e => e.habitId === habit.id).map(e => e.actualMinutes!)), occurrenceId: occurrence.id, preferred: preferredBounds(day, user.timezone, habit.preferredWindow) });
    }
    const tasks = await tx.task.findMany({ where: { userId, status: "INBOX", archived: false, events: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } } }, orderBy: { id: "asc" } });
    for (const task of tasks) items.push({ ...taskToSchedulable(task), durationMinutes: adjustedDuration(task.durationMinutes, history.filter(e => e.task?.title.trim().toLocaleLowerCase() === task.title.trim().toLocaleLowerCase()).map(e => e.actualMinutes!)), preferred: preferredBounds(day, user.timezone, task.energy === "DEEP" && task.preferredWindow === "ANY" ? focus : task.preferredWindow) });
    const result = scheduleInWindows(remainingWindows, protectedEvents, items, user.bufferMinutes);
    for (const placement of result.placements) {
      await tx.event.create({ data: {
        userId, title: placement.item.title, startsAt: placement.startsAt, endsAt: placement.endsAt, planningDate: date,
        estimatedMinutes: placement.item.durationMinutes, locked: false, source: placement.item.source, habitId: placement.item.habitId, occurrenceId: placement.item.occurrenceId, taskId: placement.item.taskId,
      } });
    }
    await tx.task.updateMany({ where: { userId, id: { in: result.placements.flatMap(p => p.item.taskId ? [p.item.taskId] : []) } }, data: { status: "SCHEDULED" } });
    const details: Unscheduled[] = result.skipped.map(item => ({ key: item.key, title: item.title, reason: !remainingWindows.length ? "El horario del día ya terminó." : "No hay un hueco continuo suficiente con los descansos actuales.", required: Boolean(item.required) }));
    await tx.dayPlan.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, generatedAt: now, skipped: details.map(item => item.title), details },
      update: { generatedAt: now, version: { increment: 1 }, skipped: details.map(item => item.title), details },
    });
    if (options.recordWorkerRun) await tx.workerRun.create({ data: { userId, date, status: "SUCCESS", message: `${result.placements.length} bloques; ${details.length} sin espacio`, attemptedAt: now } });
    return { placed: result.placements.length, skipped: details.map(item => item.title), alreadyPlanned: false };
  });
}

export async function runDuePlans(now = new Date(), options: { userIds?: string[] } = {}) {
  const users = await prisma.user.findMany({ where: { autoPlan: true, onboardingCompleted: true, ...(options.userIds ? { id: { in: options.userIds } } : {}) }, include: { availability: true }, orderBy: { id: "asc" } });
  let generated = 0; let failed = 0;
  for (const user of users) {
    try {
      const day = ymdInZone(now, user.timezone);
      const lastRun = await prisma.workerRun.findFirst({ where: { userId: user.id, date: dateOnly(day) }, orderBy: { attemptedAt: "desc" } });
      if (lastRun?.status === "FAILED" && lastRun.retryAt && now < lastRun.retryAt) continue;
      const windows = availabilityWindows(user, day, user.timezone);
      if (!windows.some(window => now >= window.start && now < window.end)) continue;
      const result = await generateDay(user.id, day, { now, onlyIfMissing: true, recordWorkerRun: true });
      if (!result.alreadyPlanned) generated++;
    } catch (error) {
      failed++;
      const day = ymdInZone(now, user.timezone);
      const message = error instanceof DomainError || (error instanceof Error && /^(Esta hora|Esta fecha|El fin|Zona horaria)/.test(error.message)) ? error.message : "Error de generación. Se reintentará automáticamente; revisa los logs del worker.";
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode ?? "DATABASE" : error instanceof Error ? error.name : "Error";
      console.error(JSON.stringify({ worker: "daily-planner", userId: user.id, day, code, message }));
      const recentFailures = await prisma.workerRun.count({ where: { userId: user.id, date: dateOnly(day), status: "FAILED" } });
      await prisma.workerRun.create({ data: { userId: user.id, date: dateOnly(day), retryAt: new Date(now.getTime() + Math.min(60_000 * 2 ** Math.min(recentFailures, 3), 300_000)), status: "FAILED", message, attemptedAt: now } });
    }
  }
  await prisma.workerRun.deleteMany({ where: { attemptedAt: { lt: new Date(now.getTime() - 30 * 86400_000) }, ...(options.userIds ? { userId: { in: options.userIds } } : {}) } });
  await prisma.usageSample.deleteMany({ where: { observedAt: { lt: new Date(now.getTime() - 28 * 86400_000) }, ...(options.userIds ? { userId: { in: options.userIds } } : {}) } });
  if (!options.userIds) {
    await prisma.accessAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
    await prisma.workerHeartbeat.upsert({ where: { id: "daily-planner" }, create: { id: "daily-planner", updatedAt: now }, update: { updatedAt: now } });
  }
  return { generated, failed };
}
