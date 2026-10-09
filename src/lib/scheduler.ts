import type { Habit, PreferredWindow, Task } from "@prisma/client";
import { addMinutesUtc } from "./time";

export type Gap = { start: Date; end: Date };
export type Busy = { startsAt: Date; endsAt: Date; travelMinutes?: number; recoveryMinutes?: number };
export type Schedulable = {
  key: string; title: string; durationMinutes: number; priority: number;
  preferredWindow: PreferredWindow; preferred?: Gap | null;
  focusReason?: string; originalMinutes?: number; energy?: string; required?: boolean; dueDate?: Date | null; createdAt?: Date;
  habitId?: string; occurrenceId?: string; taskId?: string; source: "HABIT" | "AUTO";
};
export type Placement = { item: Schedulable; startsAt: Date; endsAt: Date; recoveryMinutes: number; reason: string };
export type ScheduleResult = { placements: Placement[]; skipped: Schedulable[] };

export function computeGaps(start: Date, end: Date, busy: Busy[], buffer: number): Gap[] {
  if (end <= start) return [];
  const expanded = busy.map(block => ({
    start: new Date(Math.max(start.getTime(), block.startsAt.getTime() - (buffer + (block.travelMinutes ?? 0)) * 60_000)),
    end: new Date(Math.min(end.getTime(), block.endsAt.getTime() + (buffer + (block.recoveryMinutes ?? 0)) * 60_000)),
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
    if (slot) return { ...slot, preferred: true };
  }
  const fallback = fit(gaps);
  return fallback ? { ...fallback, preferred: false } : null;
}
export function scheduleItems(start: Date, end: Date, busy: Busy[], items: Schedulable[], buffer: number): ScheduleResult {
  return scheduleInWindows([{ start, end }], busy, items, buffer);
}
export type SchedulingPolicy = { maxMinutes?: number; longBlockMinutes?: number; recoveryMinutes?: number };
export function freeMinutes(windows: Gap[], busy: Busy[], buffer: number) { return windows.flatMap(w => computeGaps(w.start, w.end, busy, buffer)).reduce((n, g) => n + (g.end.getTime() - g.start.getTime()) / 60000, 0); }
export function scheduleInWindows(windows: Gap[], busy: Busy[], items: Schedulable[], buffer: number, policy: SchedulingPolicy = {}): ScheduleResult {
  const initialFree = freeMinutes(windows, busy, buffer);
  const occupied = [...busy];
  const ordered = [...items].sort((a, b) =>
    Number(Boolean(b.required)) - Number(Boolean(a.required)) ||
    a.priority - b.priority ||
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
    Number(b.energy === "DEEP") - Number(a.energy === "DEEP") ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    a.key.localeCompare(b.key)
  );
  const placements: Placement[] = []; const skipped: Schedulable[] = [];
  for (const item of ordered) {
    const slot = choose(windows.flatMap(window => computeGaps(window.start, window.end, occupied, buffer)), item);
    if (!slot) { skipped.push(item); continue; }
    const recoveryMinutes = item.durationMinutes >= (policy.longBlockMinutes ?? 90) ? policy.recoveryMinutes ?? 0 : 0;
    const withPlacement = [...occupied, { ...slot, recoveryMinutes }];
    const consumed = initialFree - freeMinutes(windows, withPlacement, buffer);
    if (policy.maxMinutes != null && consumed > policy.maxMinutes + .001) { skipped.push(item); continue; }
    const reasons = [slot.preferred ? (item.focusReason ?? "Encaja en tu franja preferida.") : item.preferred ? "Tu franja preferida no tenía un hueco suficiente; se usó el primer espacio disponible." : "Es el primer hueco disponible para esta actividad.", `${item.durationMinutes} min dentro de tu disponibilidad, con ${buffer} min de descanso entre bloques y respetando citas y traslados.`, item.required ? "Hábito esencial: se organiza antes que las actividades opcionales." : `Prioridad ${item.priority}${item.dueDate ? ` y vencimiento ${item.dueDate.toISOString().slice(0, 10)}` : ""}.`];
    if (item.originalMinutes && item.originalMinutes !== item.durationMinutes) reasons.push(`Duración ajustada de ${item.originalMinutes} a ${item.durationMinutes} min según tus mediciones anteriores.`);
    if (recoveryMinutes) reasons.push(`${recoveryMinutes} min adicionales de recuperación después de este bloque largo.`);
    if (policy.maxMinutes != null) reasons.push("Se respeta el límite de capacidad y la holgura reservada para este día.");
    placements.push({ item, startsAt: slot.startsAt, endsAt: slot.endsAt, recoveryMinutes, reason: reasons.join(" ") }); occupied.push({ ...slot, recoveryMinutes });
  }
  return { placements, skipped };
}
export function habitToSchedulable(habit: Habit): Schedulable {
  return { key: `habit:${habit.id}`, title: habit.title, durationMinutes: habit.durationMinutes, priority: habit.priority, preferredWindow: habit.preferredWindow, required: habit.required, createdAt: habit.createdAt, habitId: habit.id, source: "HABIT" };
}
export function taskToSchedulable(task: Task): Schedulable {
  return { key: `task:${task.id}`, title: task.title, durationMinutes: task.durationMinutes, priority: task.priority, preferredWindow: task.preferredWindow, energy: task.energy, dueDate: task.dueDate, createdAt: task.createdAt, taskId: task.id, source: "AUTO" };
}
