import { test } from "node:test";
import assert from "node:assert/strict";
import { learnAvailability } from "../src/lib/learning";
import { availabilityWindows, effectiveMinutes } from "../src/lib/availability";
import { dateOnly, weekdayForDate } from "../src/lib/time";
import { scheduleInWindows, type Schedulable } from "../src/lib/scheduler";
const initial = Array.from({ length: 7 }, (_, weekday) => ({ weekday, active: true, start: "08:00", end: "22:00" }));
const sample = (date: string, minute: number) => ({ date: dateOnly(date), weekday: weekdayForDate(date), minute });

test("a single 1am visit is evidence without changing the initial schedule", () => {
  const result = learnAvailability([sample("2026-10-06", 60)], initial);
  assert.ok(result.every(day => !day.windows.length && day.active === null));
});
test("repeated 1am use on distinct dates adds a separate nocturnal window", () => {
  const result = learnAvailability(["2026-10-06", "2026-10-07", "2026-10-08"].map(date => sample(date, 60)), initial);
  assert.deepEqual(result.find(day => day.weekday === 4)!.windows, [{ start: 30, end: 150 }, { start: 480, end: 1320 }]);
  assert.equal(result.find(day => day.weekday === 0)!.windows.length, 0);
});
test("many visits on the same date cannot fabricate a frequent pattern", () => {
  assert.ok(learnAvailability(Array.from({ length: 40 }, () => sample("2026-10-08", 60)), initial).every(day => !day.windows.length));
});
test("inactive weekdays need their own repeated evidence to become available", () => {
  const rows = initial.map(row => ({ ...row, active: row.weekday !== 0 }));
  const first = learnAvailability([sample("2026-09-20", 60), sample("2026-09-21", 60), sample("2026-09-22", 60)], rows);
  assert.equal(first.find(day => day.weekday === 0)!.active, null);
  const later = learnAvailability(["2026-09-20", "2026-09-27", "2026-10-04"].map(date => sample(date, 60)), rows);
  assert.equal(later.find(day => day.weekday === 0)!.active, true);
});
test("dense three-week history refines broad schedules and unused days", () => {
  const samples = Array.from({ length: 22 }, (_, i) => {
    const date = new Date("2026-09-14T00:00:00Z"); date.setUTCDate(date.getUTCDate() + i);
    const value = date.toISOString().slice(0,10); const weekday = weekdayForDate(value);
    return weekday === 0 || weekday === 6 ? [] : [sample(value, 540), sample(value, 1020)];
  }).flat();
  const result = learnAvailability(samples, initial);
  assert.equal(result.find(day => day.weekday === 0)!.active, false);
  assert.deepEqual(result.find(day => day.weekday === 1)!.windows, [{ start: 510, end: 1110 }]);
});
test("pausing learning uses the initial windows", () => {
  const row = { ...initial[4], learnedWindows: [{ start: 30, end: 150 }], learnedActive: true };
  const profile = { dayStart: "08:00", dayEnd: "22:00", adaptiveAvailability: false, availability: [row] } as Parameters<typeof effectiveMinutes>[0];
  assert.deepEqual(effectiveMinutes(profile, 4), [{ start: 480, end: 1320 }]);
});
test("midnight boundaries convert to the next local date", () => {
  const profile = { dayStart: "08:00", dayEnd: "22:00", adaptiveAvailability: true, availability: [{ ...initial[4], learnedWindows: [{ start: 1380, end: 1440 }], learnedActive: true }] } as Parameters<typeof effectiveMinutes>[0];
  const windows = availabilityWindows(profile, "2026-10-08", "America/Guayaquil");
  assert.equal(windows[0].end.toISOString(), "2026-10-09T05:00:00.000Z");
});
test("scheduler respects gaps between learned windows", () => {
  const windows = [{ start: new Date("2026-10-08T01:00:00Z"), end: new Date("2026-10-08T02:00:00Z") }, { start: new Date("2026-10-08T08:00:00Z"), end: new Date("2026-10-08T09:00:00Z") }];
  const item: Schedulable = { key: "long", title: "Long task", durationMinutes: 90, priority: 1, preferredWindow: "ANY", source: "AUTO" };
  assert.equal(scheduleInWindows(windows, [], [item], 0).skipped.length, 1);
});
