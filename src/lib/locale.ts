import { z } from "zod";
import { combineLocalDateTime } from "./time";
import { english } from "./translations";
export const PreferencesSchema = z.object({ locale: z.enum(["es", "en"]), hourFormat: z.enum(["12", "24"]), weekStartsOn: z.coerce.number().int().refine(n => n === 0 || n === 1) });
export type Preferences = { locale: string; hourFormat: string; weekStartsOn: number };
export const DEFAULT_PREFERENCES: Preferences = { locale: "es", hourFormat: "24", weekStartsOn: 1 };
export function parsePreferences(value: unknown): Preferences { const parsed = PreferencesSchema.safeParse(value); return parsed.success ? parsed.data : DEFAULT_PREFERENCES; }
const patterns = Object.entries(english).filter(([key]) => key.includes("{0}")).sort((a, b) => b[0].length - a[0].length).map(([key, replacement]) => {
  const indices: number[] = [];
  const expression = key.split(/(\{\d+\})/g).map(piece => {
    if (/^\{\d+\}$/.test(piece)) { indices.push(Number(piece.slice(1, -1))); return "(.*?)"; }
    return piece.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  }).join("");
  return { regex: new RegExp("^" + expression + "$"), replacement, indices };
});
export function translator(locale: string) {
  function translate(text: string): string {
    if (locale !== "en") return text;
    const key = text.trim(); let translated = Object.hasOwn(english, key) ? english[key] : undefined;
    if (!translated) for (const { regex, replacement, indices } of patterns) {
      const match = regex.exec(key);
      if (match) { translated = replacement.replace(/\{(\d+)\}/g, (_, i: string) => match[indices.indexOf(Number(i)) + 1] ?? ""); break; }
    }
    if (translated) { const start = text.indexOf(key); return text.slice(0, start) + translated + text.slice(start + key.length); }
    const sentences = text.split(/(?<=\.)\s+/);
    return sentences.length > 1 ? sentences.map(translate).join(" ") : text;
  }
  return translate;
}
export function displayTime(date: Date, timezone: string, preferences: Preferences) {
  return new Intl.DateTimeFormat(preferences.locale, { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: preferences.hourFormat === "12" ? "h12" : "h23" }).format(date);
}
export function displayClock(value: string, preferences: Preferences) { return displayTime(new Date("2000-01-01T" + value + ":00Z"), "UTC", preferences); }
export function displayDateTime(date: Date, timezone: string, preferences: Preferences) { return new Intl.DateTimeFormat(preferences.locale, { timeZone: timezone, dateStyle: "medium", timeStyle: "short", hourCycle: preferences.hourFormat === "12" ? "h12" : "h23" }).format(date); }
export function displayDay(date: string, timezone: string, preferences: Preferences) { return new Intl.DateTimeFormat(preferences.locale, { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(combineLocalDateTime(date, "12:00", timezone)); }
export function orderedWeekdays(weekStartsOn: number) { return Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7); }
export function weekdayLabel(day: number, locale: string, style: "short" | "long" = "short") { return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 4 + day))); }
