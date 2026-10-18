export type ReviewEvent = { status: string; startsAt: Date; endsAt: Date; taskId: string | null; habitId: string | null; actualMinutes: number | null; minimal?: boolean };
export type ReviewOutcome = "DONE" | "SKIPPED" | "POSTPONED" | "MISSED" | "UPCOMING";
export type ReviewKind = "HABIT" | "TASK" | "FIXED";
export type ReviewDay = { date: string; planned: number; done: number; open: number; upcoming: number; plannedMinutes: number; doneMinutes: number };

const emptyDay = (date: string): ReviewDay => ({ date, planned: 0, done: 0, open: 0, upcoming: 0, plannedMinutes: 0, doneMinutes: 0 });
export function scheduledMinutes(event: { startsAt: Date; endsAt: Date }) { return Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000); }
/** What became of a block; cancelled appointments that are not postponed tasks do not count for the review. */
export function reviewOutcome(event: ReviewEvent, now: Date): ReviewOutcome | null {
  if (event.status === "DONE") return "DONE";
  if (event.status === "SKIPPED") return "SKIPPED";
  if (event.status === "CANCELLED") return event.taskId ? "POSTPONED" : null;
  return event.endsAt <= now ? "MISSED" : "UPCOMING";
}
export function reviewKind(event: { taskId: string | null; habitId: string | null }): ReviewKind { return event.habitId ? "HABIT" : event.taskId ? "TASK" : "FIXED"; }
/** Per-day and weekly totals. The completion rate ignores blocks that are still ahead, so a week in progress is not penalised. */
export function summarizeWeek(events: ReviewEvent[], dates: string[], dayOf: (value: Date) => string, now: Date) {
  const days = dates.map(emptyDay); const byDate = new Map(days.map(day => [day.date, day]));
  const kinds: Record<ReviewKind, number> = { HABIT: 0, TASK: 0, FIXED: 0 };
  for (const event of events) {
    const outcome = reviewOutcome(event, now); const day = byDate.get(dayOf(event.startsAt));
    if (!outcome || !day) continue;
    const minutes = scheduledMinutes(event);
    day.planned++; day.plannedMinutes += minutes;
    if (outcome === "DONE") { const spent = event.actualMinutes ?? (event.minimal ? 0 : minutes); day.done++; day.doneMinutes += spent; kinds[reviewKind(event)] += spent; }
    else if (outcome === "UPCOMING") day.upcoming++;
    else day.open++;
  }
  const total = days.reduce((sum, day) => ({ ...sum, planned: sum.planned + day.planned, done: sum.done + day.done, open: sum.open + day.open, upcoming: sum.upcoming + day.upcoming, plannedMinutes: sum.plannedMinutes + day.plannedMinutes, doneMinutes: sum.doneMinutes + day.doneMinutes }), emptyDay(""));
  const closed = total.done + total.open;
  return { days, total, kinds, rate: closed ? Math.round((total.done / closed) * 100) : null };
}
/** Days with at least two closed blocks, best and worst by completion; null when they do not differ. */
export function dayExtremes(days: ReviewDay[]) {
  const rated = days.filter(day => day.done + day.open >= 2).map(day => ({ date: day.date, rate: day.done / (day.done + day.open) }));
  if (rated.length < 2) return null;
  const best = rated.reduce((a, b) => b.rate > a.rate ? b : a); const worst = rated.reduce((a, b) => b.rate < a.rate ? b : a);
  return best.rate === worst.rate ? null : { best: best.date, worst: worst.date };
}
export function minutesLabel(minutes: number) {
  const rounded = Math.round(minutes); const hours = Math.floor(rounded / 60); const rest = rounded % 60;
  return hours ? (rest ? `${hours} h ${rest} min` : `${hours} h`) : `${rest} min`;
}
