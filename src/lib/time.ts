import { TZDate } from "@date-fns/tz";
import { addMinutes, format } from "date-fns";
import { es } from "date-fns/locale";
import { DateSchema, TimeSchema, TimezoneSchema } from "./definitions";

export function parseHm(value: string) { const [hours, minutes] = value.split(":").map(Number); return { hours, minutes }; }
export function dateOnly(value: string) { DateSchema.parse(value); return new Date(`${value}T00:00:00.000Z`); }
export function addLocalDays(value: string, days: number) { const d = dateOnly(value); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function ymdInZone(date: Date, timezone: string) { return format(new TZDate(date, timezone), "yyyy-MM-dd"); }
export function weekdayForDate(value: string) { return dateOnly(value).getUTCDay(); }
export function weekdayInZone(date: Date, timezone: string) { return weekdayForDate(ymdInZone(date, timezone)); }
export function nowInZone(timezone: string) { return new TZDate(new Date(), timezone); }

export function combineLocalDateTime(dateYmd: string, timeHm: string, timezone: string) {
  DateSchema.parse(dateYmd); TimeSchema.parse(timeHm); TimezoneSchema.parse(timezone);
  const { hours, minutes } = parseHm(timeHm);
  const d = new TZDate(Number(dateYmd.slice(0, 4)), Number(dateYmd.slice(5, 7)) - 1, Number(dateYmd.slice(8, 10)), hours, minutes, 0, 0, timezone);
  const target = `${dateYmd} ${timeHm}`;
  const label = (value: Date) => format(new TZDate(value, timezone), "yyyy-MM-dd HH:mm");
  if (label(d) !== target) throw new Error("Esta hora no existe por el cambio de horario. Elige otra.");
  for (const offset of [-180, -150, -120, -90, -60, -30, 30, 60, 90, 120, 150, 180]) {
    if (label(addMinutes(d, offset)) === target) throw new Error("Esta hora se repite por el cambio de horario. Elige una hora fuera de ese intervalo.");
  }
  return new Date(d.getTime());
}
export function localDayBounds(date: string, timezone: string, start: string, end: string) {
  if (start >= end) throw new Error("El fin debe ser posterior al inicio, dentro del mismo día.");
  return { start: combineLocalDateTime(date, start, timezone), end: combineLocalDateTime(date, end, timezone) };
}
export function calendarDayBounds(date: string, timezone: string) {
  return { start: combineLocalDateTime(date, "00:00", timezone), end: combineLocalDateTime(addLocalDays(date, 1), "00:00", timezone) };
}
export function formatTime(date: Date, timezone: string) { return format(new TZDate(date, timezone), "HH:mm"); }
export function formatDayHeading(date: string, timezone: string) { return format(new TZDate(combineLocalDateTime(date, "12:00", timezone), timezone), "EEEE d 'de' MMMM", { locale: es }); }
export function addMinutesUtc(date: Date, minutes: number) { return addMinutes(date, minutes); }
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) { return aStart < bEnd && bStart < aEnd; }
export function roundUp(date: Date, minutes = 5) { return new Date(Math.ceil(date.getTime() / (minutes * 60_000)) * minutes * 60_000); }
export function preferredBounds(date: string, timezone: string, preferred: string) {
  if (preferred === "ANY") return null;
  const times: Record<string, [string, string]> = { MORNING: ["06:00", "12:00"], AFTERNOON: ["12:00", "18:00"], EVENING: ["18:00", "00:00"] };
  const [start, end] = times[preferred];
  return { start: combineLocalDateTime(date, start, timezone), end: combineLocalDateTime(end === "00:00" ? addLocalDays(date, 1) : date, end, timezone) };
}
