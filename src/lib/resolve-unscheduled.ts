import type { Prisma } from "../generated/prisma/client";
import { DateSchema } from "./definitions";
import { generateDayInTransaction, type Unscheduled } from "./planner";
import { setEventStatus } from "./calendar";
import { DomainError } from "./transaction";
import { addLocalDays, dateOnly, ymdInZone } from "./time";

export async function resolveUnscheduledInTransaction(tx: Prisma.TransactionClient, userId: string, requestedDay: string, key: string, actionIndex: number, planVersion: number, now = new Date()) {
  const day = DateSchema.parse(requestedDay);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (day < ymdInZone(now, user.timezone)) throw new DomainError("Solo puedes resolver el plan de hoy o una fecha futura.");
  const plan = await tx.dayPlan.findUnique({ where: { userId_date: { userId, date: dateOnly(day) } } });
  if (!Number.isInteger(planVersion) || plan?.version !== planVersion) throw new DomainError("El plan cambió. Organiza de nuevo el día para revisar las propuestas.");
  const details = Array.isArray(plan?.details) ? plan.details as unknown as Unscheduled[] : [];
  const entry = details.find(item => item.key === key);
  const action = Number.isInteger(actionIndex) && actionIndex >= 0 ? entry?.actions?.[actionIndex] : undefined;
  if (!action) throw new DomainError("Esta propuesta ya no está disponible. Organiza de nuevo el día.");
  const taskId = key.startsWith("task:") ? key.slice(5) : undefined;
  const habitId = key.startsWith("habit:") ? key.slice(6) : undefined;
  const task = taskId ? await tx.task.findFirst({ where: { id: taskId, userId, archived: false, status: { in: ["INBOX", "SCHEDULED"] } }, include: { events: { where: { status: { in: ["DONE", "PENDING", "IN_PROGRESS"] } } } } }) : null;
  const habit = habitId ? await tx.habit.findFirst({ where: { id: habitId, userId, active: true, archived: false } }) : null;
  if (taskId && !task || habitId && !habit) throw new DomainError("La actividad cambió. Organiza de nuevo el día.");
  const excludeKeys: string[] = [];
  if (action.type === "SPLIT") {
    if (!task) throw new DomainError("Solo se pueden dividir tareas.");
    await tx.task.update({ where: { id: task.id }, data: { splittable: true, minChunk: action.minChunk } });
  } else if (action.type === "SHORTEN") {
    if (task) {
      const reserved = task.events.reduce((n,e) => n + (e.estimatedMinutes ?? (e.endsAt.getTime() - e.startsAt.getTime()) / 60000), 0);
      const durationMinutes = reserved + action.durationMinutes;
      if (durationMinutes >= task.durationMinutes || durationMinutes > 480) throw new DomainError("La duración cambió. Organiza de nuevo el día.");
      await tx.task.update({ where: { id: task.id }, data: { durationMinutes } });
    } else if (habit) await tx.habit.update({ where: { id: habit.id }, data: { durationMinutes: action.durationMinutes } });
  } else if (action.type === "MOVE_DEADLINE") {
    if (!task || task.dueDate && task.dueDate >= dateOnly(action.date)) throw new DomainError("La fecha límite cambió. Organiza de nuevo el día.");
    await tx.task.update({ where: { id: task.id }, data: { dueDate: dateOnly(action.date) } });
  } else {
    const event = await tx.event.findFirst({ where: { id: action.eventId, userId, locked: false, source: { not: "MANUAL" }, status: "PENDING", startsAt: { gte: now } } });
    if (!event || event.startsAt.toISOString() !== action.startsAt || event.endsAt.toISOString() !== action.endsAt) throw new DomainError("El bloque cambió o ya empezó. Organiza de nuevo el día.");
    await setEventStatus(tx, userId, event.id, "SKIPPED", { now, postpone: true });
    if (event.taskId) {
      const deferred = await tx.task.findUniqueOrThrow({ where: { id: event.taskId } });
      const tomorrow = dateOnly(addLocalDays(day, 1));
      if (!deferred.seriesId || deferred.dueDate && deferred.dueDate >= tomorrow) await tx.task.update({ where: { id: event.taskId }, data: { availableFrom: tomorrow } });
    }
    if (event.categoryId && !event.taskId && !event.habitId) excludeKeys.push(...details.filter(item => item.key.startsWith(`category:${event.categoryId}:`)).map(item => item.key));
    excludeKeys.push(event.taskId ? `task:${event.taskId}` : event.habitId ? `habit:${event.habitId}` : `category:${event.categoryId}`);
  }
  const result = await generateDayInTransaction(tx, userId, day, { now, excludeKeys, preserveExisting: true, targetKey: key, durationOverrides: action.type === "SHORTEN" ? { [key]: action.durationMinutes } : undefined });
  const updated = await tx.dayPlan.findUniqueOrThrow({ where: { userId_date: { userId, date: dateOnly(day) } } });
  if (action.type !== "MOVE_DEADLINE" && Array.isArray(updated.details) && (updated.details as unknown as Unscheduled[]).some(item => item.key === key)) throw new DomainError("El tiempo disponible cambió y la propuesta ya no alcanza. Organiza de nuevo el día.");
  return result;
}
