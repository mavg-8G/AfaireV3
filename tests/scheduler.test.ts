import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGaps, scheduleItems, type Schedulable } from "../src/lib/scheduler";
import { calendarDayBounds, combineLocalDateTime, addLocalDays, roundUp } from "../src/lib/time";
import { DateSchema, TimeSchema, SignupFormSchema } from "../src/lib/definitions";
const d = (time: string) => new Date(`2026-10-08T${time}:00Z`);
const item = (key: string, durationMinutes = 30, extra: Partial<Schedulable> = {}): Schedulable => ({ key, title: key, durationMinutes, priority: 2, preferredWindow: "ANY", source: "AUTO", ...extra });

test("merges overlapping busy intervals and ignores events outside the window", () => {
  const gaps = computeGaps(d("08:00"), d("12:00"), [{ startsAt: d("06:00"), endsAt: d("07:00") }, { startsAt: d("09:00"), endsAt: d("10:00") }, { startsAt: d("09:30"), endsAt: d("11:00") }, { startsAt: d("13:00"), endsAt: d("14:00") }], 0);
  assert.deepEqual(gaps, [{ start: d("08:00"), end: d("09:00") }, { start: d("11:00"), end: d("12:00") }]);
});
test("uses exactly one buffer between consecutive blocks", () => {
  const result = scheduleItems(d("08:00"), d("09:10"), [], [item("a"), item("b")], 10);
  assert.equal(result.placements.length, 2); assert.equal(result.placements[1].startsAt.getTime() - result.placements[0].endsAt.getTime(), 10 * 60_000);
});
test("exact fit needs no buffer at day boundaries", () => {
  assert.equal(scheduleItems(d("08:00"), d("08:30"), [], [item("a")], 15).placements.length, 1);
});
test("reports long tasks without splitting and never overlaps fixed blocks", () => {
  const result = scheduleItems(d("08:00"), d("10:00"), [{ startsAt: d("08:30"), endsAt: d("09:30") }], [item("large", 90), item("small", 20)], 10);
  assert.equal(result.skipped[0].key, "large"); assert.equal(result.placements[0].endsAt.getTime(), d("08:20").getTime());
});
test("required routines precede priority and due date resolves ties", () => {
  const result = scheduleItems(d("08:00"), d("09:00"), [], [item("optional", 30, { priority: 1 }), item("essential", 30, { required: true, priority: 3 })], 0);
  assert.equal(result.placements[0].item.key, "essential");
  const due = scheduleItems(d("08:00"), d("08:30"), [], [item("none"), item("due", 30, { dueDate: new Date("2026-10-09") })], 0);
  assert.equal(due.placements[0].item.key, "due");
});
test("tries a preferred range then falls back to other free time", () => {
  const result = scheduleItems(d("08:00"), d("10:00"), [], [item("a", 30, { preferred: { start: d("09:00"), end: d("10:00") } }), item("b", 90)], 0);
  assert.equal(result.placements[0].startsAt.getTime(), d("09:00").getTime()); assert.equal(result.skipped.length, 1);
  const fallback = scheduleItems(d("08:00"), d("09:00"), [], [item("c", 30, { preferred: { start: d("12:00"), end: d("13:00") } })], 0);
  assert.equal(fallback.placements[0].startsAt.getTime(), d("08:00").getTime());
});
test("empty or finished window skips all tasks", () => {
  assert.equal(scheduleItems(d("12:00"), d("10:00"), [], [item("a")], 0).skipped.length, 1);
});
test("stable identifiers make scheduling deterministic", () => {
  const a = item("a"); const b = item("b");
  assert.deepEqual(scheduleItems(d("08:00"), d("10:00"), [], [b, a], 10), scheduleItems(d("08:00"), d("10:00"), [], [a, b], 10));
});
test("local dates do not use the server timezone", () => {
  assert.equal(combineLocalDateTime("2026-10-08", "08:00", "America/Guayaquil").toISOString(), "2026-10-08T13:00:00.000Z");
  assert.equal(addLocalDays("2026-03-08", 1), "2026-03-09");
});
test("calendar days use real midnight including DST", () => {
  const bounds = calendarDayBounds("2026-03-08", "America/New_York");
  assert.equal((bounds.end.getTime() - bounds.start.getTime()) / 3600_000, 23);
});
test("rejects nonexistent and ambiguous DST times", () => {
  assert.throws(() => combineLocalDateTime("2026-03-08", "02:30", "America/New_York"), /no existe/);
  assert.throws(() => combineLocalDateTime("2026-11-01", "01:30", "America/New_York"), /se repite/);
});
test("validates actual dates, hours, normalized emails and password byte length", () => {
  assert.equal(DateSchema.safeParse("2026-02-30").success, false); assert.equal(TimeSchema.safeParse("99:99").success, false);
  assert.equal(SignupFormSchema.parse({ name: "Mar", email: " TEST@Example.com ", password: "my-long-password" }).email, "test@example.com");
  assert.equal(SignupFormSchema.safeParse({ name: "Mar", email: "a@b.com", password: "é".repeat(40) }).success, false);
  assert.equal(roundUp(new Date("2026-10-08T10:01:00Z")).toISOString(), "2026-10-08T10:05:00.000Z");
});
