import type { MinuteWindow } from "./availability";
import { hmMinutes, mergeMinuteWindows } from "./availability";
type Sample = { date: Date; weekday: number; minute: number };
type Initial = { weekday: number; active: boolean; start: string; end: string };
export type LearnedDay = { weekday: number; windows: MinuteWindow[]; active: boolean | null; reason: string | null };
const distinctDays = (samples: Sample[]) => new Set(samples.map(sample => sample.date.toISOString().slice(0, 10))).size;
function quantile(values: number[], q: number) { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor((sorted.length-1) * q)]; }

// Evidence uses distinct calendar days, not visit counts or tabs left open.
export function learnAvailability(samples: Sample[], initial: Initial[]): LearnedDay[] {
  const days = [...new Set(samples.map(sample => sample.date.getTime()))].sort((a,b) => a-b);
  const span = days.length ? (days.at(-1)! - days[0]) / 86400_000 : 0;
  const denseHistory = days.length >= 12 && span >= 20;
  const frequentHours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour =>
    distinctDays(samples.filter(sample => Math.floor(sample.minute / 60) === hour)) >= 3
  );
  return initial.map(row => {
    const local = samples.filter(sample => sample.weekday === row.weekday);
    const localDays = distinctDays(local);
    let active: boolean | null = null;
    if (!row.active && localDays >= 3) active = true;
    if (row.active && denseHistory && localDays === 0) active = false;
    if (denseHistory && localDays >= 2) active = true;
    const evidenceHours = frequentHours.filter(hour => local.some(sample => Math.floor(sample.minute / 60) === hour));
    const baseline = { start: hmMinutes(row.start), end: hmMinutes(row.end) };
    let base: MinuteWindow[] = row.active || active === true ? [baseline] : [];
    // Narrow an initial window only after dense history and repeated broad daily use.
    const byDate = new Map<number, number[]>();
    for (const sample of local) byDate.set(sample.date.getTime(), [...(byDate.get(sample.date.getTime()) ?? []), sample.minute]);
    const broadDays = [...byDate.values()].filter(minutes => Math.max(...minutes) - Math.min(...minutes) >= 360);
    let refined = false;
    if (denseHistory && broadDays.length >= 3) {
      base = [{ start: Math.max(0, quantile(broadDays.map(minutes => Math.min(...minutes)), .2) - 30), end: Math.min(1440, quantile(broadDays.map(minutes => Math.max(...minutes)), .8) + 60) }];
      refined = true;
    }
    const extra = evidenceHours.map(hour => ({ start: Math.max(0, hour * 60 - 30), end: Math.min(1440, (hour + 1) * 60 + 30) }));
    const hasEvidence = (row.active || active === true) && extra.length > 0;
    const windows = active === false ? [] : hasEvidence || refined ? mergeMinuteWindows([...base, ...extra]) : [];
    const reason = active === false ? "Sin actividad observada este día durante al menos tres semanas de uso frecuente."
      : active === true && !row.active ? `Día activado tras usar Afaire en ${localDays} fechas distintas.`
      : refined ? "Horario afinado con al menos tres semanas de actividad y varios días completos de uso."
      : hasEvidence ? "Franjas observadas en al menos tres fechas distintas; se conserva el horario inicial."
      : null;
    return { weekday: row.weekday, windows, active, reason };
  });
}
