import { test } from "node:test";
import assert from "node:assert/strict";
import { dueNotices, inQuietHours, NotificationSchema } from "../src/lib/notifications";
import { recurrenceInstances, type RecurrenceRule } from "../src/lib/recurrence";
import { dateOnly } from "../src/lib/time";
import { durationSuggestion } from "../src/lib/insights";
import { scheduleItems, type Schedulable } from "../src/lib/scheduler";
const settings = NotificationSchema.parse({ upcoming: true, leadMinutes: 10, dailySummary: true, summaryTime: "01:30", dueTomorrow: true, dueTime: "01:30" });
const rule: RecurrenceRule = { frequency: "WEEKLY", startDate: "2026-10-25", until: "2026-11-08", weekdays: [0], startTime: "09:00", endTime: "10:00", endDayOffset: 0, timezone: "America/New_York" };
test("fall recurrence keeps wall clock; ambiguous occurrences are rejected", () => {
  assert.deepEqual(recurrenceInstances(rule).map(e => e.startsAt.toISOString()), ["2026-10-25T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-08T14:00:00.000Z"]);
  assert.throws(() => recurrenceInstances({ ...rule, startTime: "01:30" }), /se repite/);
});
test("quiet hours cover midnight, exact boundaries, equal times and timezone changes", () => {
  const quiet = { quietEnabled: true, quietStart: "22:00", quietEnd: "08:00" };
  for (const iso of ["2026-10-09T03:00Z", "2026-10-09T12:59Z"]) assert.equal(inQuietHours(new Date(iso), "America/Guayaquil", quiet), true);
  assert.equal(inQuietHours(new Date("2026-10-09T13:00Z"), "America/Guayaquil", quiet), false);
  assert.equal(inQuietHours(new Date("2026-10-09T02:59Z"), "America/Guayaquil", quiet), false);
  assert.equal(inQuietHours(new Date("2026-10-09T03:00Z"), "Asia/Tokyo", quiet), false);
  assert.equal(inQuietHours(new Date(), "UTC", { ...quiet, quietStart: "08:00", quietEnd: "08:00" }), true);
  assert.equal(inQuietHours(new Date("2026-10-09T12:00Z"), "UTC", { ...quiet, quietStart: "12:00", quietEnd: "14:00" }), true);
});
test("notices use instants across DST; repeated local summary has the same delivery key", () => {
  const events = [{ id: "a", title: "A", status: "PENDING", startsAt: new Date("2026-11-01T06:35Z") }];
  const early = dueNotices(new Date("2026-11-01T05:30Z"), "America/New_York", settings, events, [{ title: "Due", dueDate: dateOnly("2026-11-02") }]);
  const late = dueNotices(new Date("2026-11-01T06:30Z"), "America/New_York", settings, events, [{ title: "Due", dueDate: dateOnly("2026-11-02") }]);
  assert.equal(early.some(n => n.key.startsWith("event:")), false);
  assert.equal(late.filter(n => n.key.startsWith("event:")).length, 1);
  assert.deepEqual(early.map(n => n.key), late.filter(n => !n.key.startsWith("event:")).map(n => n.key));
  assert.equal(dueNotices(new Date("2026-11-01T06:30Z"), "America/New_York", { ...settings, quietEnabled: true, quietStart: "01:00", quietEnd: "02:00" }, events, []).length, 0);
});
test("completed, skipped, cancelled and already-started blocks never get upcoming notices", () => {
  const now = new Date("2026-10-08T09:00Z");
  const events = ["DONE", "SKIPPED", "CANCELLED", "IN_PROGRESS"].map(status => ({ id: status, title: status, status, startsAt: new Date("2026-10-08T09:05Z") }));
  assert.equal(dueNotices(now, "UTC", { ...settings, dailySummary: false, dueTomorrow: false }, events, []).length, 0);
  const pending = [{ ...events[0], id: "pending", status: "PENDING" }];
  assert.equal(dueNotices(now, "UTC", settings, pending, [])[0].key, dueNotices(now, "UTC", { ...settings, leadMinutes: 20 }, pending, [])[0].key);
});
test("duration suggestions need evidence and placement explains preferred fallback", () => {
  assert.equal(durationSuggestion(40, [60, 60]), null);
  assert.deepEqual(durationSuggestion(40, [60, 60, 480]), { estimated: 40, suggested: 50, median: 60, samples: 3 });
  assert.equal(durationSuggestion(40, [40, 40, 40]), null);
  const item: Schedulable = { key: "t", title: "T", priority: 2, source: "AUTO", preferredWindow: "AFTERNOON", durationMinutes: 30, preferred: { start: new Date("2030-01-01T12:00Z"), end: new Date("2030-01-01T13:00Z") } };
  const placement = scheduleItems(new Date("2030-01-01T08:00Z"), new Date("2030-01-01T10:00Z"), [], [item], 10).placements[0];
  assert.match(placement.reason, /franja preferida no tenía/);
  assert.match(placement.reason, /10 min de descanso/);
});
