import { test } from "node:test";
import assert from "node:assert/strict";
import { recurrenceDates, recurrenceInstances, type RecurrenceRule } from "../src/lib/recurrence";
import { adjustedDuration, habitStats, learnedFocus } from "../src/lib/insights";
import { dueNotices, validPushEndpoint } from "../src/lib/notifications";
import { calendarDayBounds, combineLocalDateTime, dateOnly } from "../src/lib/time";
import { scheduleItems, type Schedulable } from "../src/lib/scheduler";
const rule: RecurrenceRule = { frequency: "DAILY", startDate: "2026-10-08", until: "2026-10-10", weekdays: [], startTime: "09:00", endTime: "10:00", endDayOffset: 0, timezone: "America/Guayaquil" };
test("recurrence is inclusive, weekday-specific and skips absent month dates", () => {
  assert.deepEqual(recurrenceDates(rule), ["2026-10-08", "2026-10-09", "2026-10-10"]);
  assert.deepEqual(recurrenceDates({ ...rule, frequency: "WEEKLY", weekdays: [1, 3], until: "2026-10-15" }), ["2026-10-12", "2026-10-14"]);
  assert.deepEqual(recurrenceDates({ ...rule, frequency: "MONTHLY", startDate: "2028-01-31", until: "2028-04-30" }), ["2028-01-31", "2028-03-31"]);
  assert.deepEqual(recurrenceDates({ ...rule, frequency: "MONTHLY", startDate: "2028-01-29", until: "2028-03-30" }), ["2028-01-29", "2028-02-29", "2028-03-29"]);
  assert.throws(() => recurrenceDates({ ...rule, frequency: "WEEKLY" }), /Selecciona/);
  assert.throws(() => recurrenceDates({ ...rule, until: "2028-01-01" }), /366/);
});
test("weekly wall clock survives DST without drifting UTC or losing overnight ends", () => {
  const instances = recurrenceInstances({ ...rule, timezone: "America/New_York", startDate: "2026-03-01", until: "2026-03-15", frequency: "WEEKLY", weekdays: [0] });
  assert.deepEqual(instances.map(i => i.startsAt.toISOString()), ["2026-03-01T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-15T13:00:00.000Z"]);
  const overnight = recurrenceInstances({ ...rule, startTime: "23:30", endTime: "01:00", endDayOffset: 1 });
  assert.equal((overnight[0].endsAt.getTime() - overnight[0].startsAt.getTime()) / 60_000, 90);
  assert.throws(() => recurrenceInstances({ ...rule, startDate: "2026-03-07", until: "2026-03-09", startTime: "02:30", timezone: "America/New_York" }), /no existe/);
});
test("planner respects midnight, travel plus rest and both DST day lengths", () => {
  const task: Schedulable = { key: "a", title: "Task", durationMinutes: 30, priority: 2, preferredWindow: "ANY", source: "AUTO" };
  const result = scheduleItems(new Date("2026-10-08T00:00Z"), new Date("2026-10-08T02:00Z"), [{ startsAt: new Date("2026-10-07T23:30Z"), endsAt: new Date("2026-10-08T00:30Z") }, { startsAt: new Date("2026-10-08T01:40Z"), endsAt: new Date("2026-10-08T02:00Z"), travelMinutes: 20 }], [task], 10);
  assert.equal(result.placements[0].startsAt.toISOString(), "2026-10-08T00:40:00.000Z");
  assert.equal(result.placements[0].endsAt.toISOString(), "2026-10-08T01:10:00.000Z");
  const fall = calendarDayBounds("2026-11-01", "America/New_York");
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3600_000, 25);
  const instant = combineLocalDateTime("2026-10-08", "09:00", "America/Guayaquil");
  assert.equal(instant.toISOString(), "2026-10-08T14:00:00.000Z");
});
test("duration learning needs three measurements, resists outliers and is bounded", () => {
  assert.equal(adjustedDuration(40, [80, 90]), 40);
  assert.equal(adjustedDuration(40, [80, 90, 100]), 50);
  assert.equal(adjustedDuration(40, [10, 10, 480]), 30);
  assert.equal(adjustedDuration(480, [480, 480, 480]), 480);
  assert.equal(adjustedDuration(7, [30, 30, 30]), 7);
  assert.equal(learnedFocus(Array.from({ length: 12 }, () => ({ minute: 800 })), "MORNING"), "AFTERNOON");
});
test("streak skips non-habit days and today's unfinished occurrence but breaks on a missed due day", () => {
  const stats = habitStats([1, 3, 5], "2026-10-05", "2026-10-11", "2026-10-01", new Set(["2026-10-02", "2026-10-05", "2026-10-07"]), "2026-10-09");
  assert.deepEqual(stats, { streak: 3, expected: 3, done: 2 });
  assert.equal(habitStats([1, 3, 5], "2026-10-05", "2026-10-11", "2026-10-01", new Set(["2026-10-02", "2026-10-07"]), "2026-10-09").streak, 1);
});
const settings = { upcoming: true, leadMinutes: 10, dailySummary: true, summaryTime: "08:00", dueTomorrow: true, dueTime: "08:00" };
test("three notices use local dates, suppress started blocks and avoid stale daily summaries", () => {
  const now = new Date("2026-10-08T13:05:00Z");
  const events = [{ id: "a", title: "Class", startsAt: new Date("2026-10-08T13:10:00Z"), status: "PENDING" }, { id: "b", title: "Already started", startsAt: new Date("2026-10-08T13:11:00Z"), status: "IN_PROGRESS" }];
  const notices = dueNotices(now, "America/Guayaquil", settings, events, [{ title: "Due", dueDate: dateOnly("2026-10-09") }]);
  assert.equal(notices.length, 3); assert.match(notices[0].title, /5 min/); assert.equal(notices[2].url, "/inbox");
  assert.equal(dueNotices(new Date("2026-10-08T15:00:00Z"), "America/Guayaquil", settings, events, []).length, 0);
  assert.equal(dueNotices(now, "America/Guayaquil", { ...settings, upcoming: false, dailySummary: false, dueTomorrow: false }, events, []).length, 0);
});
test("push endpoints cannot send server traffic to arbitrary or local addresses", () => {
  for (const endpoint of ["https://127.0.0.1/push", "http://fcm.googleapis.com/push", "https://fcm.googleapis.com.evil.invalid/", "https://evil.invalid/", "https://user@web.push.apple.com/", "https://web.push.apple.com:444/"]) assert.equal(validPushEndpoint(endpoint), false);
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/test", "https://web.push.apple.com/test", "https://updates.push.services.mozilla.com/test"]) assert.equal(validPushEndpoint(endpoint), true);
});

test("calendar bounds handle skipped and repeated midnight without rejecting a real day", () => {
  const spring = calendarDayBounds("2026-09-06", "America/Santiago");
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3600_000, 23);
  assert.equal(spring.start.toISOString(), "2026-09-06T04:00:00.000Z");
});

test("upcoming notices account for departure time when a located appointment has travel", () => {
  const notices = dueNotices(new Date("2026-10-08T13:00Z"), "America/Guayaquil", { ...settings, dailySummary: false, dueTomorrow: false }, [{ id: "gym", title: "Gym", startsAt: new Date("2026-10-08T13:30Z"), status: "PENDING", travelMinutes: 20 }], []);
  assert.equal(notices.length, 1); assert.match(notices[0].title, /30 min/); assert.match(notices[0].body, /traslado/);
});
