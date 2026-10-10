import { headers } from "next/headers";
import type { DayOverride, Event } from "../generated/prisma/client";
import { availabilityWindows } from "@/lib/availability";
import { displayDay, type Preferences } from "@/lib/locale";
import { calendarDayBounds, dateOnly } from "@/lib/time";
import { assignLanes, gridClass, gridCss, gridRange, minuteInDay, type GridDay, type GridItem } from "@/lib/time-grid";
import { TimeGridBoard } from "./TimeGridBoard";

type Profile = Parameters<typeof availabilityWindows>[0];
export async function TimeGrid({ profile, timezone, preferences, dates, today, now, events, overrides }: { profile: Profile; timezone: string; preferences: Preferences; dates: string[]; today: string; now: Date; events: Event[]; overrides: DayOverride[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const short = new Intl.DateTimeFormat(preferences.locale, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const days: GridDay[] = []; const items: GridItem[] = []; const windows: { cls: string; day: number; start: number; end: number }[] = [];
  dates.forEach((date, day) => {
    const bounds = calendarDayBounds(date, timezone);
    days.push({ date, label: short.format(dateOnly(date)), longLabel: displayDay(date, timezone, preferences), isToday: date === today });
    const override = overrides.find(value => value.date.getTime() === dateOnly(date).getTime());
    availabilityWindows(profile, date, timezone, override).forEach((window, index) => windows.push({ cls: `tg-w-${day}-${index}`, day, start: minuteInDay(window.start, bounds, timezone), end: minuteInDay(window.end, bounds, timezone) }));
    const visible = events.filter(event => !["CANCELLED", "SKIPPED"].includes(event.status) && event.startsAt < bounds.end && event.endsAt > bounds.start)
      .map(event => ({ event, start: minuteInDay(event.startsAt, bounds, timezone), end: minuteInDay(event.endsAt, bounds, timezone) })).filter(value => value.end > value.start);
    const lanes = assignLanes(visible.map(value => ({ id: value.event.id, start: value.start, end: value.end })));
    for (const { event, start, end } of visible) items.push({
      id: event.id, cls: gridClass(event.id, day), title: event.title, day, start, end, ...lanes.get(event.id)!,
      locked: event.locked, done: event.status === "DONE", active: event.status === "IN_PROGRESS", kind: event.source,
      movable: event.status === "PENDING" && event.startsAt >= bounds.start && event.endsAt <= bounds.end, dayLocked: Boolean(event.occurrenceId),
    });
  });
  const range = gridRange([...windows, ...items].flatMap(value => [value.start, value.end]));
  const todayIndex = dates.indexOf(today); const nowMinute = todayIndex < 0 ? -1 : minuteInDay(now, calendarDayBounds(today, timezone), timezone);
  const nowDay = nowMinute > range.start && nowMinute < range.end ? todayIndex : null;
  const css = gridCss(range, [...windows, ...items, ...(nowDay == null ? [] : [{ cls: "tg-now", start: nowMinute, end: nowMinute + 1 }])]);
  return <TimeGridBoard days={days} items={items} windows={windows.map(({ cls, day }) => ({ cls, day }))} range={range} nowDay={nowDay} css={css} nonce={nonce} />;
}
