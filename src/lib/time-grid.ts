import { addLocalDays, formatTime } from "./time";

export const GRID_STEP = 15;
export type GridSegment = { id: string; start: number; end: number };
export type GridItem = {
  id: string; cls: string; title: string; day: number; start: number; end: number; lane: number; lanes: number;
  locked: boolean; done: boolean; active: boolean; kind: string; movable: boolean; dayLocked: boolean;
};
export type GridDay = { date: string; label: string; longLabel: string; isToday: boolean };

export function hmMinutes(time: string) { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; }
export function minuteHm(minute: number) { const m = ((minute % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
/** Wall-clock minute of an instant within a local day, clamped to that day. */
export function minuteInDay(value: Date, bounds: { start: Date; end: Date }, timezone: string) {
  if (value <= bounds.start) return 0;
  if (value >= bounds.end) return 1440;
  return hmMinutes(formatTime(value, timezone));
}
/** Side-by-side lanes for blocks that overlap; every block in a cluster shares the lane count. */
export function assignLanes(segments: GridSegment[]) {
  const result = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  let cluster: { id: string; lane: number }[] = []; let laneEnds: number[] = []; let clusterEnd = -1;
  const flush = () => { for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length }); cluster = []; laneEnds = []; };
  for (const segment of sorted) {
    if (cluster.length && segment.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex(end => end <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end; cluster.push({ id: segment.id, lane }); clusterEnd = Math.max(clusterEnd, segment.end);
  }
  flush();
  return result;
}
/** Visible hours: availability and blocks plus one hour of margin, aligned to full hours. */
export function gridRange(minutes: number[]) {
  if (!minutes.length) return { start: 7 * 60, end: 21 * 60 };
  const start = Math.max(0, Math.floor(Math.min(...minutes) / 60) * 60 - 60);
  const end = Math.min(1440, Math.ceil(Math.max(...minutes) / 60) * 60 + 60);
  return end - start >= 180 ? { start, end } : { start: Math.max(0, end - 180), end: Math.max(180, end) };
}
export function snapMinute(minute: number, step = GRID_STEP) { return Math.round(minute / step) * step; }
export function clampStart(start: number, duration: number, range: { start: number; end: number }) {
  return Math.max(range.start, Math.min(start, Math.max(range.start, range.end - duration)));
}
/** Moves a local date and minute by a number of minutes, crossing midnight when needed. */
export function shiftSlot(date: string, minute: number, delta: number) {
  const total = minute + delta; const days = Math.floor(total / 1440);
  return { date: days ? addLocalDays(date, days) : date, time: minuteHm(total) };
}
const percent = (value: number) => `${Math.round(value * 1000) / 1000}%`;
export function gridClass(id: string, day: number) { return `tg-${id.replace(/[^A-Za-z0-9_-]/g, "")}-${day}`; }
/** Positions come from a nonce stylesheet because the CSP forbids inline style attributes. */
export function gridCss(range: { start: number; end: number }, placed: { cls: string; start: number; end: number; lane?: number; lanes?: number }[], hourRem = 3.25) {
  const span = range.end - range.start;
  const rules = [`.tg-body{height:${(span / 60) * hourRem}rem}`];
  for (const item of placed) {
    if (!/^[A-Za-z0-9_-]+$/.test(item.cls)) continue;
    const start = Math.max(range.start, item.start); const end = Math.min(range.end, item.end);
    if (end <= start) { rules.push(`.${item.cls}{display:none}`); continue; }
    const lanes = item.lanes ?? 1; const lane = item.lane ?? 0;
    rules.push(`.${item.cls}{top:${percent(((start - range.start) / span) * 100)};height:${percent(((end - start) / span) * 100)}${lanes > 1 ? `;left:${percent((lane / lanes) * 100)};width:${percent(100 / lanes)}` : ""}}`);
  }
  return rules.join("");
}
