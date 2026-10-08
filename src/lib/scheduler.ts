import type { Habit, PreferredWindow, Task } from "@prisma/client";
import { addMinutesUtc } from "./time";

export type Gap = { start: Date; end: Date };
export type Busy = { startsAt: Date; endsAt: Date };
export type Schedulable = {
  key: string; title: string; durationMinutes: number; priority: number;
  preferredWindow: PreferredWindow; preferred?: Gap | null;
  required?: boolean; dueDate?: Date | null; createdAt?: Date;
  habitId?: string; occurrenceId?: string; taskId?: string; source: "HABIT" | "AUTO";
};
export type Placement = { item: Schedulable; startsAt: Date; endsAt: Date };
export type ScheduleResult = { placements: Placement[]; skipped: Schedulable[] };

export function computeGaps(start: Date, end: Date, busy: Busy[], buffer: number): Gap[] {
  if (end <= start) return [];
  const expanded = busy.map(block => ({
    start: new Date(Math.max(start.getTime(), block.startsAt.getTime() - buffer * 60_000)),
    end: new Date(Math.min(end.getTime(), block.endsAt.getTime() + buffer * 60_000)),
  })).filter(block => block.end > block.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  const gaps: Gap[] = [];
  let cursor = start;
  for (const block of expanded) {
    if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
    if (block.end > cursor) cursor = block.end;
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  return gaps;
}
function choose(gaps: Gap[], item: Schedulable) {
  const fit = (list: Gap[]) => {
    for (const gap of list) {
      const end = addMinutesUtc(gap.start, item.durationMinutes);
      if (end <= gap.end) return { startsAt: gap.start, endsAt: end };
    }
    return null;
  };
  if (item.preferred) {
    const preferred = gaps.map(gap => ({
      start: new Date(Math.max(gap.start.getTime(), item.preferred!.start.getTime())),
      end: new Date(Math.min(gap.end.getTime(), item.preferred!.end.getTime())),
    })).filter(gap => gap.end > gap.start);
    const slot = fit(preferred);
    if (slot) return slot;
  }
  return fit(gaps);
}
export function scheduleItems(start: Date, end: Date, busy: Busy[], items: Schedulable[], buffer: number): ScheduleResult {
  return scheduleInWindows([{ start, end }], busy, items, buffer);
}
export function scheduleInWindows(windows: Gap[], busy: Busy[], items: Schedulable[], buffer: number): ScheduleResult {
  const occupied = [...busy];
  const ordered = [...items].sort((a, b) =>
    Number(Boolean(b.required)) - Number(Boolean(a.required)) ||
    a.priority - b.priority ||
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    a.key.localeCompare(b.key)
  );
  const placements: Placement[] = []; const skipped: Schedulable[] = [];
  for (const item of ordered) {
    const slot = choose(windows.flatMap(window => computeGaps(window.start, window.end, occupied, buffer)), item);
    if (!slot) { skipped.push(item); continue; }
    placements.push({ item, ...slot }); occupied.push(slot);
  }
  return { placements, skipped };
}
export function habitToSchedulable(habit: Habit): Schedulable {
  return { key: `habit:${habit.id}`, title: habit.title, durationMinutes: habit.durationMinutes, priority: habit.priority, preferredWindow: habit.preferredWindow, required: habit.required, createdAt: habit.createdAt, habitId: habit.id, source: "HABIT" };
}
export function taskToSchedulable(task: Task): Schedulable {
  return { key: `task:${task.id}`, title: task.title, durationMinutes: task.durationMinutes, priority: task.priority, preferredWindow: task.preferredWindow, dueDate: task.dueDate, createdAt: task.createdAt, taskId: task.id, source: "AUTO" };
}
