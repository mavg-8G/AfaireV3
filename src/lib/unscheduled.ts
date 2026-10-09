import type { Event } from "../generated/prisma/client";
import { freeMinutes, scheduleInWindows, type Gap, type Schedulable, type SchedulingPolicy } from "./scheduler";
import { addLocalDays } from "./time";

export type ResolutionAction =
  | { type: "SPLIT"; minChunk: number }
  | { type: "SHORTEN"; durationMinutes: number }
  | { type: "MOVE_DEADLINE"; date: string }
  | { type: "RELEASE_BLOCK"; eventId: string; title: string; startsAt: string; endsAt: string };

export function explainUnscheduled(item: Schedulable, day: string, windows: Gap[], protectedEvents: Event[], placed: Event[], buffer: number, policy: SchedulingPolicy): ResolutionAction[] {
  const occupied = [...protectedEvents, ...placed];
  const initialFree = freeMinutes(windows, protectedEvents, buffer);
  const trialPolicy = (blocks: Event[]) => ({ ...policy, maxMinutes: policy.maxMinutes == null ? undefined : Math.max(0, policy.maxMinutes - (initialFree - freeMinutes(windows, blocks, buffer))) });
  const fits = (candidate: Schedulable, blocks = occupied) => scheduleInWindows(windows, blocks, [candidate], buffer, trialPolicy(blocks)).placements.length > 0;
  const actions: ResolutionAction[] = [];
  if (item.taskId && !item.splittable) {
    const minChunk = Math.min(30, Math.floor(item.durationMinutes / 2));
    if (minChunk >= 5 && fits({ ...item, splittable: true, minChunk })) actions.push({ type: "SPLIT", minChunk });
  }
  if (item.taskId || item.habitId) {
    for (let minutes = Math.floor((item.durationMinutes - 1) / 5) * 5; minutes >= 5; minutes -= 5) {
      if (fits({ ...item, durationMinutes: minutes })) { actions.push({ type: "SHORTEN", durationMinutes: minutes }); break; }
    }
  }
  if (item.taskId) actions.push({ type: "MOVE_DEADLINE", date: addLocalDays(item.dueDate && item.dueDate.toISOString().slice(0,10) > day ? item.dueDate.toISOString().slice(0,10) : day, 1) });
  const blocker = occupied.filter(event => !event.locked && event.source !== "MANUAL" && event.status === "PENDING" && event.taskId !== item.taskId && event.habitId !== item.habitId && windows.some(w => event.startsAt >= w.start && event.startsAt < w.end)).sort((a,b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id)).find(event => fits(item, occupied.filter(other => other.id !== event.id)));
  if (blocker) actions.push({ type: "RELEASE_BLOCK", eventId: blocker.id, title: blocker.title, startsAt: blocker.startsAt.toISOString(), endsAt: blocker.endsAt.toISOString() });
  return actions;
}
