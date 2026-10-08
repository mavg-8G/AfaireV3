import type { Availability } from "@prisma/client";
import { calendarDayBounds, combineLocalDateTime, weekdayForDate } from "./time";
import type { Gap } from "./scheduler";

export type MinuteWindow = { start: number; end: number };
type Profile = { dayStart: string; dayEnd: string; adaptiveAvailability: boolean; availability: Pick<Availability, "weekday" | "active" | "start" | "end" | "learnedWindows" | "learnedActive">[] };
export function minuteLabel(minute: number) { return minute === 1440 ? "24:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }
export function hmMinutes(time: string) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
export function mergeMinuteWindows(windows: MinuteWindow[]) {
  const merged: MinuteWindow[] = [];
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}
export function validMinuteWindows(value: unknown): MinuteWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MinuteWindow => Boolean(item) && typeof item === "object" && Number.isInteger(item.start) && Number.isInteger(item.end) && item.start >= 0 && item.end <= 1440 && item.start < item.end);
}
export function effectiveMinutes(profile: Profile, weekday: number) {
  const row = profile.availability.find(value => value.weekday === weekday);
  const active = profile.adaptiveAvailability && row?.learnedActive != null ? row.learnedActive : row?.active ?? true;
  if (!active) return [];
  const learned = profile.adaptiveAvailability ? validMinuteWindows(row?.learnedWindows) : [];
  return learned.length ? learned : [{ start: hmMinutes(row?.start ?? profile.dayStart), end: hmMinutes(row?.end ?? profile.dayEnd) }];
}
export function availabilityWindows(profile: Profile, date: string, timezone: string): Gap[] {
  const calendar = calendarDayBounds(date, timezone);
  return effectiveMinutes(profile, weekdayForDate(date)).map(window => ({
    start: combineLocalDateTime(date, minuteLabel(window.start), timezone),
    end: window.end === 1440 ? calendar.end : combineLocalDateTime(date, minuteLabel(window.end), timezone),
  }));
}
export function availabilitySummary(profile: Profile, weekday: number) {
  const windows = effectiveMinutes(profile, weekday);
  return windows.length ? windows.map(window => `${minuteLabel(window.start)}–${minuteLabel(window.end)}`).join(" · ") : "Sin disponibilidad automática";
}
