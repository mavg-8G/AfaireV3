import type { Habit, PreferredWindow, Task } from "@prisma/client";
import { addMinutesUtc } from "./time";

export type Gap = { start: Date; end: Date };
export type Busy = { startsAt: Date; endsAt: Date; travelMinutes?: number; recoveryMinutes?: number };
export type Schedulable = {
  splittable?: boolean; minChunk?: number;
  categoryId?: string | null; categoryWeight?: number; budgetFill?: boolean;
  key: string; title: string; durationMinutes: number; priority: number;
  preferredWindow: PreferredWindow; preferred?: Gap | null;
  focusReason?: string; originalMinutes?: number; explicitEstimate?: boolean; energy?: string; required?: boolean; dueDate?: Date | null; createdAt?: Date;
  habitId?: string; occurrenceId?: string; taskId?: string; source: "HABIT" | "AUTO";
};
export type Placement = { item: Schedulable; startsAt: Date; endsAt: Date; recoveryMinutes: number; reason: string; chunkIndex?: number; chunkCount?: number };
export type FailureCode = "NO_CONTIGUOUS_SLOT" | "CAPACITY_EXCEEDED" | "MIN_CHUNK_UNAVAILABLE";
export type ScheduleResult = { placements: Placement[]; skipped: Schedulable[]; failures: Record<string, FailureCode> };

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
export type SchedulingPolicy = { firstKey?: string; maxMinutes?: number; longBlockMinutes?: number; recoveryMinutes?: number; categoryFillLimits?: Record<string, number>; planningDate?: Date; urgencyEnabled?: boolean; urgencySoonDays?: number; urgencyNearDays?: number };
export function effectivePriority(item: Schedulable, policy: SchedulingPolicy) {
  if (!item.dueDate || policy.urgencyEnabled === false || !policy.planningDate) return item.priority;
  const days = Math.round((item.dueDate.getTime() - policy.planningDate.getTime()) / 86400_000);
  const bonus = days < 0 ? 3 : days <= (policy.urgencyNearDays ?? 1) ? 2 : days <= (policy.urgencySoonDays ?? 3) ? 1 : 0;
  return Math.max(1, item.priority - bonus);
}
// Largest gaps first avoids stranding a remainder below the minimum. Each
// chosen gap contributes a range [minimum, capacity], so the total stays exact.
function splitSlots(gaps: Gap[], item: Schedulable, buffer: number, policy: SchedulingPolicy, tryPreferred = true): { startsAt: Date; endsAt: Date; preferred: boolean }[] | null {
  if (tryPreferred && item.preferred) {
    const preferred = gaps.map(gap => ({ start: new Date(Math.max(gap.start.getTime(), item.preferred!.start.getTime())), end: new Date(Math.min(gap.end.getTime(), item.preferred!.end.getTime())) }));
    const slots = splitSlots(preferred, item, buffer, policy, false);
    if (slots) return slots;
  }
  const minimum = item.minChunk ?? 30;
  const candidates = gaps.map(gap => ({ ...gap, capacity: Math.floor((gap.end.getTime() - gap.start.getTime()) / 60000) })).filter(gap => gap.capacity >= minimum).sort((a,b) => b.capacity - a.capacity || a.start.getTime() - b.start.getTime());
  let capacity = 0;
  for (let count = 1; count <= candidates.length; count++) {
    capacity += candidates[count - 1].capacity;
    if (capacity < item.durationMinutes || count * minimum > item.durationMinutes) continue;
    let remaining = item.durationMinutes;
    const slots = candidates.slice(0,count).sort((a,b) => a.start.getTime() - b.start.getTime()).map(gap => ({ startsAt: gap.start, endsAt: gap.start, limit: gap.end, preferred: false, capacity: gap.capacity }));
    // Fill later gaps first, leaving room after earlier chunks for rest. This
    // also avoids an unnecessary long-block recovery before the next fragment.
    for (let index = slots.length - 1; index >= 0; index--) {
      const minutes = Math.min(slots[index].capacity, remaining - index * minimum);
      remaining -= minutes;
      slots[index].endsAt = addMinutesUtc(slots[index].startsAt, minutes);
    }
    let previousEnd: Date | undefined;
    let previousRecovery = 0;
    for (const slot of slots) {
      const minutes = (slot.endsAt.getTime() - slot.startsAt.getTime()) / 60000;
      if (previousEnd) slot.startsAt = new Date(Math.max(slot.startsAt.getTime(), addMinutesUtc(previousEnd, buffer + previousRecovery).getTime()));
      slot.endsAt = addMinutesUtc(slot.startsAt, minutes);
      if (slot.endsAt > slot.limit) return null;
      slot.preferred = Boolean(item.preferred && slot.startsAt >= item.preferred.start && slot.endsAt <= item.preferred.end);
      previousEnd = slot.endsAt;
      previousRecovery = minutes >= (policy.longBlockMinutes ?? 90) ? policy.recoveryMinutes ?? 0 : 0;
    }
    return slots.map(({ startsAt, endsAt, preferred }) => ({ startsAt, endsAt, preferred }));
  }
  return null;
}
export function freeMinutes(windows: Gap[], busy: Busy[], buffer: number) { return windows.flatMap(w => computeGaps(w.start, w.end, busy, buffer)).reduce((n, g) => n + (g.end.getTime() - g.start.getTime()) / 60000, 0); }
export function scheduleInWindows(windows: Gap[], busy: Busy[], items: Schedulable[], buffer: number, policy: SchedulingPolicy = {}): ScheduleResult {
  const initialFree = freeMinutes(windows, busy, buffer);
  const occupied = [...busy];
  const ordered = [...items].sort((a, b) =>
    Number(b.key === policy.firstKey) - Number(a.key === policy.firstKey) ||
    Number(Boolean(b.required)) - Number(Boolean(a.required)) ||
    effectivePriority(a, policy) - effectivePriority(b, policy) ||
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
    (b.categoryWeight ?? 0) - (a.categoryWeight ?? 0) ||
    Number(Boolean(a.budgetFill)) - Number(Boolean(b.budgetFill)) ||
    Number(b.energy === "DEEP") - Number(a.energy === "DEEP") ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    a.key.localeCompare(b.key)
  );
  const placements: Placement[] = []; const skipped: Schedulable[] = [];
  const failures: Record<string, FailureCode> = {};
  const placedCategory: Record<string, number> = {};
  for (const originalItem of ordered) {
    let item = originalItem;
    if (item.budgetFill && item.categoryId) {
      const remaining = (policy.categoryFillLimits?.[item.categoryId] ?? 0) - (placedCategory[item.categoryId] ?? 0);
      if (remaining < 5) continue;
      item = { ...item, durationMinutes: Math.min(item.durationMinutes, Math.floor(remaining / 5) * 5) };
    }
    const gaps = windows.flatMap(window => computeGaps(window.start, window.end, occupied, buffer));
    let slot = choose(gaps, item);
    let recoveryMinutes = item.durationMinutes >= (policy.longBlockMinutes ?? 90) ? policy.recoveryMinutes ?? 0 : 0;
    let consumed = slot ? initialFree - freeMinutes(windows, [...occupied, { ...slot, recoveryMinutes }], buffer) : Infinity;
    if (item.budgetFill) {
      while ((!slot || (policy.maxMinutes != null && consumed > policy.maxMinutes + .001)) && item.durationMinutes > 5) {
        item = { ...item, durationMinutes: item.durationMinutes - 5 }; slot = choose(gaps,item);
        recoveryMinutes = item.durationMinutes >= (policy.longBlockMinutes ?? 90) ? policy.recoveryMinutes ?? 0 : 0;
        consumed = slot ? initialFree - freeMinutes(windows,[...occupied,{...slot,recoveryMinutes}],buffer) : Infinity;
      }
    }
    if (!slot && item.taskId && item.splittable) {
      const fragments = splitSlots(gaps, item, buffer, policy);
      if (fragments) {
        const blocks = fragments.map(part => ({ ...part, recoveryMinutes: (part.endsAt.getTime() - part.startsAt.getTime()) / 60000 >= (policy.longBlockMinutes ?? 90) ? policy.recoveryMinutes ?? 0 : 0 }));
        const cost = initialFree - freeMinutes(windows, [...occupied, ...blocks], buffer);
        if (policy.maxMinutes == null || cost <= policy.maxMinutes + .001) {
          blocks.forEach((part,index) => {
            const minutes = (part.endsAt.getTime() - part.startsAt.getTime()) / 60000;
            const priority = effectivePriority(item, policy);
            const reasons = [`Fragmento ${index + 1}/${blocks.length}: ${minutes} de ${item.durationMinutes} min, mínimo ${item.minChunk ?? 30} min.`, `No había un hueco continuo; se usan huecos distintos respetando citas, traslados y ${buffer} min de descanso.`, `Prioridad base ${item.priority}, efectiva ${priority}.`];
            if (item.dueDate) reasons.push(policy.urgencyEnabled === false ? "Bonus de urgencia desactivado." : `Urgencia: +1 nivel a ${policy.urgencySoonDays ?? 3} días, +2 a ${policy.urgencyNearDays ?? 1} días y máxima si venció.`);
            if (item.preferred) reasons.push(part.preferred ? item.focusReason ?? "Encaja en tu franja preferida." : "Tu franja preferida no tenía un hueco suficiente; se usó el primer espacio disponible.");
            if (part.recoveryMinutes) reasons.push(`${part.recoveryMinutes} min adicionales de recuperación después de este bloque largo.`);
            if (policy.maxMinutes != null) reasons.push("Se respeta el límite de capacidad y la holgura reservada para este día.");
            placements.push({ ...part, item: { ...item, durationMinutes: minutes }, chunkIndex: index + 1, chunkCount: blocks.length, reason: reasons.join(" ") });
          });
          occupied.push(...blocks);
          if (item.categoryId) placedCategory[item.categoryId] = (placedCategory[item.categoryId] ?? 0) + item.durationMinutes;
          continue;
        }
        failures[item.key] = "CAPACITY_EXCEEDED";
      }
    }
    if (!slot || (policy.maxMinutes != null && consumed > policy.maxMinutes + .001)) {
      skipped.push(item);
      failures[item.key] ??= slot || freeMinutes(windows, occupied, buffer) < item.durationMinutes ? "CAPACITY_EXCEEDED" : item.splittable ? "MIN_CHUNK_UNAVAILABLE" : "NO_CONTIGUOUS_SLOT";
      continue;
    }
    if (item.budgetFill && originalItem.durationMinutes - item.durationMinutes >= 5) ordered.push({ ...originalItem, key: originalItem.key + ":rest", durationMinutes: originalItem.durationMinutes - item.durationMinutes });
    const reasons = [slot.preferred ? (item.focusReason ?? "Encaja en tu franja preferida.") : item.preferred ? "Tu franja preferida no tenía un hueco suficiente; se usó el primer espacio disponible." : "Es el primer hueco disponible para esta actividad.", `${item.durationMinutes} min dentro de tu disponibilidad, con ${buffer} min de descanso entre bloques y respetando citas y traslados.`, item.required ? "Hábito esencial: se organiza antes que las actividades opcionales." : `Prioridad ${item.priority}${item.dueDate ? ` y vencimiento ${item.dueDate.toISOString().slice(0, 10)}` : ""}.`];
    if (item.dueDate) reasons.push(`Prioridad base ${item.priority}, efectiva ${effectivePriority(item, policy)}. ${policy.urgencyEnabled === false ? "Bonus de urgencia desactivado." : `Urgencia: +1 nivel a ${policy.urgencySoonDays ?? 3} días, +2 a ${policy.urgencyNearDays ?? 1} días y máxima si venció.`}`);
    if (item.originalMinutes && item.originalMinutes !== item.durationMinutes) reasons.push(`Duración ajustada de ${item.originalMinutes} a ${item.durationMinutes} min según ${item.explicitEstimate ? "tu feedback reciente" : "tus mediciones anteriores"}.`);
    if (item.budgetFill) reasons.push("Tiempo reservado para acercarte al objetivo semanal de esta categoría.");
    if (recoveryMinutes) reasons.push(`${recoveryMinutes} min adicionales de recuperación después de este bloque largo.`);
    if (policy.maxMinutes != null) reasons.push("Se respeta el límite de capacidad y la holgura reservada para este día.");
    placements.push({ item, startsAt: slot.startsAt, endsAt: slot.endsAt, recoveryMinutes, reason: reasons.join(" ") }); occupied.push({ ...slot, recoveryMinutes });
    if (item.categoryId) placedCategory[item.categoryId] = (placedCategory[item.categoryId] ?? 0) + item.durationMinutes;
  }
  return { placements, skipped, failures };
}
export function habitToSchedulable(habit: Habit): Schedulable {
  return { categoryId: habit.categoryId, key: `habit:${habit.id}`, title: habit.title, durationMinutes: habit.durationMinutes, priority: habit.priority, preferredWindow: habit.preferredWindow, required: habit.required, createdAt: habit.createdAt, habitId: habit.id, source: "HABIT" };
}
export function taskToSchedulable(task: Task): Schedulable {
  return { splittable: task.splittable, minChunk: task.minChunk, categoryId: task.categoryId, key: `task:${task.id}`, title: task.title, durationMinutes: task.durationMinutes, priority: task.priority, preferredWindow: task.preferredWindow, energy: task.energy, dueDate: task.dueDate, createdAt: task.createdAt, taskId: task.id, source: "AUTO" };
}
