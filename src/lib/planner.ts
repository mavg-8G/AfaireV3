import { recordPostponement } from "./procrastination";
import { captureAgenda, saveRevision } from "./plan-history";
import { feedbackPolicy, feedbackDuration } from "./plan-feedback";
import { categoryTargets, categoryFillItems } from "./category-budgets";
import { materializeTaskSeries } from "./task-series";
import { weeklyHabitDue } from "./weekly-habits";
import { Prisma, type Event } from "@prisma/client";
import { adjustedDuration, learnedFocus } from "./insights";
import { prisma } from "./prisma";
import { DateSchema } from "./definitions";
import { withUserLock, DomainError } from "./transaction";
import { calendarDayBounds, dateOnly, preferredBounds, roundUp, weekdayForDate, ymdInZone, addMinutesUtc, addLocalDays } from "./time";
import { availabilityWindows } from "./availability";
import { habitToSchedulable, taskToSchedulable, scheduleInWindows, freeMinutes, type Schedulable, type SchedulingPolicy, type FailureCode } from "./scheduler";
import { explainUnscheduled, type ResolutionAction } from "./unscheduled";

export type Unscheduled = { key: string; title: string; reason: string; required: boolean; code?: FailureCode | "DEADLINE_PASSED" | "DAY_MODE" | "PAUSED" | "DAY_ENDED"; actions?: ResolutionAction[] };
export type PlanOptions = { now?: Date; onlyIfMissing?: boolean; recordWorkerRun?: boolean; dayMode?: "NORMAL" | "SHORT" | "DIFFICULT"; excludeKeys?: string[]; preserveExisting?: boolean; targetKey?: string; durationOverrides?: Record<string, number> };
export async function generateDay(userId: string, requestedDay?: string, options: PlanOptions = {}) {
  return withUserLock(userId, tx => generateDayInTransaction(tx, userId, requestedDay, options));
}
export async function generateDayInTransaction(tx: Prisma.TransactionClient, userId: string, requestedDay?: string, options: PlanOptions = {}) {
  const now = options.now ?? new Date();
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { availability: true } });
    const today = ymdInZone(now, user.timezone);
    const day = DateSchema.parse(requestedDay ?? today);
    if (day < today) throw new DomainError("Solo puedes planificar hoy o una fecha futura.");
    const date = dateOnly(day);
    const previousOverride = await tx.dayOverride.findUnique({ where: { userId_date: { userId, date } } });
    if (options.dayMode) {
      const mode = { capacityPercent: options.dayMode === "NORMAL" ? 100 : options.dayMode === "SHORT" ? 50 : 30, essentialOnly: options.dayMode === "DIFFICULT" };
      await tx.dayOverride.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...mode }, update: mode });
    }
    const override = await tx.dayOverride.findUnique({ where: { userId_date: { userId, date } } });
    const existingPlan = await tx.dayPlan.findUnique({ where: { userId_date: { userId, date } } });
    if (options.onlyIfMissing && existingPlan) return { placed: 0, skipped: existingPlan.skipped, alreadyPlanned: true };
    const weekday = weekdayForDate(day);
    const windows = availabilityWindows(user, day, user.timezone, override);
    if (!windows.length && !override?.paused) throw new DomainError("Este día no tiene disponibilidad. Actívalo en Ajustes.");
    const calendar = calendarDayBounds(day, user.timezone);
    const todayCalendar = calendarDayBounds(today, user.timezone);
    const start = new Date(Math.max((windows[0]?.start ?? calendar.start).getTime(), day === today ? roundUp(now).getTime() : (windows[0]?.start ?? calendar.start).getTime()));
    const remainingWindows = windows.map(window => ({ ...window, start: new Date(Math.max(start.getTime(), window.start.getTime())) })).filter(window => window.end > window.start);

    // A pending task from a previous day can be released without copying its identity.
    if (user.carryOver) {
      const expired = await tx.event.findMany({ where: { userId, source: "AUTO", locked: false, status: "PENDING", taskId: { not: null }, endsAt: { lte: todayCalendar.start } } });
      if (expired.length) {
        for (const event of expired) await recordPostponement(tx, event, now);
        await tx.event.updateMany({ where: { userId, id: { in: expired.map(event => event.id) } }, data: { status: "CANCELLED" } });
        await tx.task.updateMany({ where: { userId, archived: false, status: "SCHEDULED", id: { in: expired.map(event => event.taskId!) } }, data: { status: "INBOX" } });
      }
    }
    const before = await captureAgenda(tx, userId, day); before.override = previousOverride;
    before.overrides = before.overrides.filter(row => row.date.getTime() !== date.getTime());
    if (previousOverride) before.overrides.push(previousOverride);
    before.overrides.sort((a,b) => a.id.localeCompare(b.id));
    const feedback = await tx.planFeedback.findMany({ where: { userId, date: { gte: dateOnly(addLocalDays(today, -28)), lte: dateOnly(today) } } });
    const signal = feedbackPolicy(feedback);
    const effectiveSlack = Math.min(50, user.slackPercent + signal.extraSlack);
    const events = await tx.event.findMany({ where: { userId, OR: [
      { startsAt: { lt: addMinutesUtc(calendar.end, user.bufferMinutes + 180) }, endsAt: { gt: addMinutesUtc(calendar.start, -user.bufferMinutes - 180) } },
      { planningDate: date },
    ] } });
    const replaceable = options.preserveExisting ? [] : events.filter(event => event.planningDate?.getTime() === date.getTime() && !event.locked && event.source !== "MANUAL" && event.status === "PENDING" && event.startsAt >= start);
    const replacementIds = new Set(replaceable.map(event => event.id));
    const protectedEvents = events.filter(event => !replacementIds.has(event.id) && !["CANCELLED", "SKIPPED"].includes(event.status));
    // Replace only future generated blocks, and reset their linked tasks atomically.
    if (replaceable.length) {
      await tx.event.deleteMany({ where: { userId, id: { in: [...replacementIds] } } });
      await tx.task.updateMany({ where: { userId, archived: false, status: "SCHEDULED", id: { in: replaceable.flatMap(event => event.taskId ? [event.taskId] : []) } }, data: { status: "INBOX" } });
    }
    await materializeTaskSeries(tx, userId, day, addLocalDays(day, 90));
    const history = user.adaptiveDurations ? await tx.event.findMany({ where: { userId, status: "DONE", chunkIndex: null, actualMinutes: { not: null } }, orderBy: { startsAt: "asc" }, include: { task: true } }) : [];
    const focus = signal.preferredWindow ?? (user.focusWindow === "LEARNED" ? learnedFocus(await tx.usageSample.findMany({ where: { userId, timezone: user.timezone, observedAt: { gte: new Date(now.getTime() - 28 * 86400_000) } } }), "MORNING") : user.focusWindow);
    const habits = await tx.habit.findMany({ where: { userId, active: true, archived: false, OR: [{ frequencyMode: "DAYS", daysOfWeek: { has: weekday } }, { frequencyMode: "WEEKLY" }] }, orderBy: { id: "asc" } });
    const items: Schedulable[] = [];
    for (const habit of habits) {
      if (override?.essentialOnly && !habit.required) continue;
      if (habit.frequencyMode === "WEEKLY" && !await weeklyHabitDue(tx, user, habit, day, now)) continue;
      const occurrence = await tx.habitOccurrence.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        create: { userId, habitId: habit.id, date },
        update: {},
        include: { event: true },
      });
      if (occurrence.status !== "PENDING" || occurrence.event) continue;
      items.push({ ...habitToSchedulable(habit), explicitEstimate: feedback.some(row => row.reason === "ESTIMATE" && row.habitId === habit.id), originalMinutes: habit.durationMinutes, durationMinutes: feedbackDuration(adjustedDuration(habit.durationMinutes, history.filter(e => e.habitId === habit.id).map(e => e.actualMinutes!)), feedback, undefined, habit.id, habit.durationMinutes), occurrenceId: occurrence.id, preferred: preferredBounds(day, user.timezone, habit.preferredWindow === "ANY" ? signal.preferredWindow ?? "ANY" : habit.preferredWindow) });
    }
    const tasks = await tx.task.findMany({ where: { userId, status: { in: ["INBOX", "SCHEDULED"] }, archived: false, AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: date } }] }, { OR: [{ splittable: true }, { events: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } } }] }] }, include: { events: { where: { status: { in: ["DONE", "PENDING", "IN_PROGRESS"] } } } }, orderBy: { id: "asc" } });
    for (const task of tasks) items.push({ ...taskToSchedulable(task), explicitEstimate: feedback.some(row => row.reason === "ESTIMATE" && row.taskId === task.id), originalMinutes: task.durationMinutes, focusReason: signal.preferredWindow ? "La franja se eligió teniendo en cuenta tu feedback reciente sobre la hora." : task.energy === "DEEP" && task.preferredWindow === "ANY" ? `Tarea profunda situada en tu franja de foco${user.focusWindow === "LEARNED" ? " estimada a partir del uso reciente" : " elegida en Ajustes"}.` : undefined, durationMinutes: feedbackDuration(adjustedDuration(task.durationMinutes, history.filter(e => e.title.trim().toLocaleLowerCase() === task.title.trim().toLocaleLowerCase()).map(e => e.actualMinutes!)), feedback, task.id, undefined, task.durationMinutes), preferred: preferredBounds(day, user.timezone, task.preferredWindow === "ANY" ? (signal.preferredWindow ?? (task.energy === "DEEP" ? focus : "ANY")) : task.preferredWindow) });
    // Completed and protected fragments retain their credit when the rest is replanned.
    for (const task of tasks) {
      const item = items.find(item => item.taskId === task.id)!;
      if (task.splittable || task.events.some(event => event.chunkIndex != null)) {
        const reserved = task.events.reduce((n,event) => n + (event.estimatedMinutes ?? (event.endsAt.getTime() - event.startsAt.getTime()) / 60000), 0);
        item.durationMinutes = Math.max(0, task.durationMinutes - reserved);
        item.originalMinutes = item.durationMinutes;
      }
    }
    const categoryGoals = await categoryTargets(tx, userId, day, now, protectedEvents, signal.extraSlack);
    const fillLimits = Object.fromEntries(categoryGoals.map(goal => [goal.category.id, goal.todayMinutes]));
    for (const item of items) if (item.categoryId && categoryGoals.some(goal => goal.category.id === item.categoryId && goal.remaining > 0)) item.categoryWeight = 1;
    for (const goal of categoryGoals) items.push(...categoryFillItems(goal.category, goal.todayMinutes).map(item => ({ ...item, preferred: preferredBounds(day, user.timezone, goal.category.preferredWindow === "ANY" ? signal.preferredWindow ?? "ANY" : goal.category.preferredWindow) })));
    const expiredKeys = new Set(tasks.filter(task => task.seriesId && task.dueDate && task.dueDate < date).map(task => `task:${task.id}`));
    const deferred = items.filter(item => expiredKeys.has(item.key) || (override?.essentialOnly && !item.required && item.priority !== 1 && (!item.dueDate || item.dueDate > dateOnly(addLocalDays(day, 1)))));
    const eligible = items.filter(item => item.durationMinutes > 0 && !deferred.includes(item) && !options.excludeKeys?.some(key => item.key === key || item.key.startsWith(key + ":")));
    for (const item of eligible) if (options.durationOverrides?.[item.key] != null) item.durationMinutes = options.durationOverrides[item.key];
    const baselineEvents = options.preserveExisting ? protectedEvents.filter(event => !(event.planningDate?.getTime() === date.getTime() && !event.locked && event.source !== "MANUAL" && event.status === "PENDING" && event.startsAt >= start)) : protectedEvents;
    const baselineFree = freeMinutes(remainingWindows, baselineEvents, user.bufferMinutes);
    const used = baselineFree - freeMinutes(remainingWindows, protectedEvents, user.bufferMinutes);
    const budget = Math.max(0, baselineFree * (1 - effectiveSlack / 100) * (override?.capacityPercent ?? 100) / 100 - used);
    const policy: SchedulingPolicy = { firstKey: options.targetKey, categoryFillLimits: fillLimits, maxMinutes: effectiveSlack || (override?.capacityPercent ?? 100) < 100 ? budget : undefined, longBlockMinutes: user.longBlockMinutes, recoveryMinutes: user.recoveryMinutes, planningDate: date, urgencyEnabled: user.urgencyEnabled, urgencySoonDays: user.urgencySoonDays, urgencyNearDays: user.urgencyNearDays };
    const result = scheduleInWindows(remainingWindows, protectedEvents, eligible, user.bufferMinutes, policy);
    const createdEvents: Event[] = [];
    const nextIndices = new Map(tasks.map(task => [task.id, Math.max(0, ...task.events.map(event => event.chunkIndex ?? 1))]));
    for (const placement of result.placements) {
      const task = tasks.find(task => task.id === placement.item.taskId);
      const chunkIndex = task && (task.splittable || placement.chunkIndex) ? (nextIndices.get(task.id) ?? 0) + 1 : null;
      if (task && chunkIndex) nextIndices.set(task.id, chunkIndex);
      createdEvents.push(await tx.event.create({ data: {
        userId, categoryId: placement.item.categoryId, title: placement.item.title, startsAt: placement.startsAt, endsAt: placement.endsAt, planningDate: date,
        chunkIndex, chunkCount: chunkIndex,
        recoveryMinutes: placement.recoveryMinutes, planningReason: placement.reason + (signal.extraSlack ? ` Se reserva ${effectiveSlack} % de holgura, incluyendo tus señales de sobrecarga recientes.` : "") + (signal.preferredWindow && placement.item.preferredWindow === "ANY" ? " La franja se eligió teniendo en cuenta tu feedback reciente sobre la hora." : ""), estimatedMinutes: placement.item.durationMinutes, locked: false, source: placement.item.source, habitId: placement.item.habitId, occurrenceId: placement.item.occurrenceId, taskId: placement.item.taskId,
      } }));
    }
    for (const task of tasks.filter(task => result.placements.some(p => p.item.taskId === task.id) && task.splittable)) {
      const chunks = await tx.event.findMany({ where: { userId, taskId: task.id, status: { in: ["DONE", "PENDING", "IN_PROGRESS"] } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
      if (chunks.every((event,index) => event.chunkIndex === index + 1 && event.chunkCount === chunks.length)) continue;
      const offset = Math.max(...chunks.map(e => e.chunkIndex ?? 1)) + chunks.length;
      for (let i = 0; i < chunks.length; i++) await tx.event.update({ where: { id: chunks[i].id }, data: { chunkIndex: offset + i + 1, chunkCount: offset + chunks.length } });
      for (let i = 0; i < chunks.length; i++) await tx.event.update({ where: { id: chunks[i].id }, data: { chunkIndex: i + 1, chunkCount: chunks.length, planningReason: chunks[i].planningReason?.replace(/^Fragmento \d+\/\d+:/, `Fragmento ${i + 1}/${chunks.length}:`) } });
    }
    await tx.task.updateMany({ where: { userId, id: { in: result.placements.flatMap(p => p.item.taskId ? [p.item.taskId] : []) } }, data: { status: "SCHEDULED" } });
    // A preserved fragment can keep a task scheduled even when its remainder did not fit.
    for (const task of tasks) {
      const active = await tx.event.count({ where: { userId, taskId: task.id, status: { in: ["PENDING", "IN_PROGRESS"] } } });
      if (active) await tx.task.update({ where: { id: task.id }, data: { status: "SCHEDULED" } });
    }
    const descriptions = { NO_CONTIGUOUS_SLOT: "Hay tiempo libre, pero no un hueco continuo suficiente.", CAPACITY_EXCEEDED: "El tiempo restante o el límite de capacidad, descansos y holgura no alcanza.", MIN_CHUNK_UNAVAILABLE: "Los huecos disponibles no permiten fragmentos con el mínimo elegido.", DEADLINE_PASSED: "La fecha límite ya pasó. Mueve el vencimiento para recuperar esta actividad.", DAY_MODE: "Pospuesta por el modo día difícil: se conservan esenciales, prioridad alta y vencimientos próximos.", PAUSED: "Planificador pausado para esta fecha.", DAY_ENDED: "El horario del día ya terminó." };
    const details: Unscheduled[] = [...result.skipped, ...deferred].filter(item => item.durationMinutes > 0).map(item => {
      const code = expiredKeys.has(item.key) || item.dueDate && item.dueDate < date ? "DEADLINE_PASSED" : deferred.includes(item) ? "DAY_MODE" : override?.paused ? "PAUSED" : !remainingWindows.length ? "DAY_ENDED" : result.failures[item.key];
      const actions = code === "DEADLINE_PASSED" && item.taskId ? [{ type: "MOVE_DEADLINE" as const, date: addLocalDays(day, 1) }] : ["DAY_MODE", "PAUSED", "DAY_ENDED"].includes(code) ? [] : explainUnscheduled(item, day, remainingWindows, protectedEvents, createdEvents, user.bufferMinutes, policy);
      return { key: item.key, title: item.title, code, reason: expiredKeys.has(item.key) ? "La ventana de esta repetición ya venció. Mueve su fecha límite para recuperarla." : descriptions[code], required: Boolean(item.required), actions };
    });
    await tx.dayPlan.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, generatedAt: now, skipped: details.map(item => item.title), details },
      update: { generatedAt: now, version: { increment: 1 }, skipped: details.map(item => item.title), details },
    });
    await saveRevision(tx, userId, day, before, options.dayMode ? `MODE_${options.dayMode}` : options.recordWorkerRun ? "WORKER" : "PLAN", now);
    if (options.recordWorkerRun) await tx.workerRun.create({ data: { userId, date, status: "SUCCESS", message: `${result.placements.length} bloques; ${details.length} sin espacio`, attemptedAt: now } });
    return { placed: result.placements.length, skipped: details.map(item => item.title), alreadyPlanned: false };
}

export async function runDuePlans(now = new Date(), options: { userIds?: string[] } = {}) {
  const users = await prisma.user.findMany({ where: { onboardingCompleted: true, OR: [{ autoPlan: true }, { taskSeries: { some: { active: true } } }], ...(options.userIds ? { id: { in: options.userIds } } : {}) }, include: { availability: true, taskSeries: { where: { active: true }, select: { id: true } } }, orderBy: { id: "asc" } });
  let generated = 0; let failed = 0;
  for (const user of users) {
    try {
      const day = ymdInZone(now, user.timezone);
      const lastRun = await prisma.workerRun.findFirst({ where: { userId: user.id, kind: "PLAN", date: dateOnly(day) }, orderBy: { attemptedAt: "desc" } });
      if (lastRun?.status === "FAILED" && lastRun.retryAt && now < lastRun.retryAt) continue;
      if (user.taskSeries.length) await withUserLock(user.id, tx=>materializeTaskSeries(tx,user.id,day,addLocalDays(day,90)));
      if (!user.autoPlan) continue;
      const override = await prisma.dayOverride.findUnique({ where: { userId_date: { userId: user.id, date: dateOnly(day) } } });
      const windows = availabilityWindows(user, day, user.timezone, override);
      if (!windows.some(window => now >= window.start && now < window.end)) continue;
      const result = await generateDay(user.id, day, { now, onlyIfMissing: true, recordWorkerRun: true });
      if (!result.alreadyPlanned) generated++;
    } catch (error) {
      failed++;
      const day = ymdInZone(now, user.timezone);
      const message = error instanceof DomainError || (error instanceof Error && /^(Esta hora|Esta fecha|El fin|Zona horaria)/.test(error.message)) ? error.message : "Error de generación. Se reintentará automáticamente; revisa los logs del worker.";
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode ?? "DATABASE" : error instanceof Error ? error.name : "Error";
      console.error(JSON.stringify({ worker: "daily-planner", userId: user.id, day, code, message }));
      const recentFailures = await prisma.workerRun.count({ where: { userId: user.id, kind: "PLAN", date: dateOnly(day), status: "FAILED" } });
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
