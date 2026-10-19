import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDayBounds } from "../src/lib/time";
import { GRID_MIN_BLOCK, assignLanes, clampStart, displayedInterval, gridClass, gridCss, gridRange, minuteHm, minuteInDay, shiftSlot, snapMinute } from "../src/lib/time-grid";
import { translator } from "../src/lib/locale";
import { dayExtremes, minutesLabel, summarizeWeek, type ReviewEvent } from "../src/lib/weekly-review";

test("blocks map to wall-clock minutes and are clamped to their local day", () => {
  const bounds = calendarDayBounds("2026-10-12", "America/Guayaquil");
  assert.equal(minuteInDay(new Date("2026-10-12T14:30:00Z"), bounds, "America/Guayaquil"), 9 * 60 + 30);
  assert.equal(minuteInDay(new Date("2026-10-12T03:00:00Z"), bounds, "America/Guayaquil"), 0);
  assert.equal(minuteInDay(new Date("2026-10-13T08:00:00Z"), bounds, "America/Guayaquil"), 1440);
  // Spring forward in New York: 03:30 local is shown at 03:30, not at its elapsed offset.
  assert.equal(minuteInDay(new Date("2026-03-08T07:30:00Z"), calendarDayBounds("2026-03-08", "America/New_York"), "America/New_York"), 3 * 60 + 30);
});
test("overlapping blocks share lanes and separate blocks keep the full width", () => {
  const lanes = assignLanes([{ id: "a", start: 540, end: 600 }, { id: "b", start: 570, end: 630 }, { id: "c", start: 600, end: 660 }, { id: "d", start: 700, end: 730 }]);
  assert.deepEqual(lanes.get("a"), { lane: 0, lanes: 2 }); assert.deepEqual(lanes.get("b"), { lane: 1, lanes: 2 });
  assert.deepEqual(lanes.get("c"), { lane: 0, lanes: 2 }); assert.deepEqual(lanes.get("d"), { lane: 0, lanes: 1 });
});
test("visible range, snapping and nudges stay inside valid times", () => {
  assert.deepEqual(gridRange([8 * 60, 18 * 60, 7 * 60 + 30]), { start: 6 * 60, end: 19 * 60 });
  assert.deepEqual(gridRange([30, 1440]), { start: 0, end: 1440 });
  assert.deepEqual(gridRange([]), { start: 420, end: 1260 });
  assert.equal(snapMinute(547), 540); assert.equal(snapMinute(548), 555);
  assert.equal(clampStart(300, 60, { start: 360, end: 1140 }), 360); assert.equal(clampStart(1130, 60, { start: 360, end: 1140 }), 1080);
  assert.equal(minuteHm(1440), "00:00"); assert.equal(minuteHm(9 * 60 + 5), "09:05");
  assert.deepEqual(shiftSlot("2026-10-12", 5, -15), { date: "2026-10-11", time: "23:50" });
  assert.deepEqual(shiftSlot("2026-12-31", 23 * 60 + 50, 15), { date: "2027-01-01", time: "00:05" });
});
test("grid stylesheet only emits safe class selectors and numeric positions", () => {
  assert.equal(gridClass("abc</style>{}", 2), "tg-abcstyle-2");
  const css = gridCss({ start: 360, end: 1080 }, [{ cls: "tg-a-0", start: 540, end: 600, lane: 1, lanes: 2 }, { cls: "bad}{", start: 0, end: 10 }, { cls: "tg-b-0", start: 0, end: 300 }]);
  assert.equal(css, ".tg-body{height:84rem}.tg-a-0{top:25%;height:8.333%;left:50%;width:50%}.tg-b-0{display:none}");
  assert.match(css, /^[A-Za-z0-9_.:;%{}-]+$/);
  // Short blocks keep a readable height; at the end of the grid they grow upwards instead.
  assert.equal(gridCss({ start: 0, end: 200 }, [{ cls: "tg-s-0", start: 100, end: 105, min: 20 }, { cls: "tg-e-0", start: 195, end: 200, min: 20 }, { cls: "tg-l-0", start: 0, end: 50, min: 20 }], 3),
    ".tg-body{height:10rem}.tg-s-0{top:50%;height:10%}.tg-e-0{top:90%;height:10%}.tg-l-0{top:0%;height:25%}");
});

test("enlarged short blocks share lanes when their visible areas meet at midnight", () => {
  const range = { start: 0, end: 1440 };
  const segments = [{ id: "earlier", start: 1415, end: 1420 }, { id: "last", start: 1435, end: 1440 }]
    .map(item => ({ id: item.id, ...displayedInterval(item.start, item.end, range, GRID_MIN_BLOCK) }));
  assert.deepEqual(segments[1], { id: "last", start: 1410, end: 1440 });
  const lanes = assignLanes(segments);
  assert.equal(lanes.get("earlier")?.lanes, 2); assert.equal(lanes.get("last")?.lanes, 2);
  assert.notEqual(lanes.get("earlier")?.lane, lanes.get("last")?.lane);
  assert.match(gridCss(range, [{ cls: "tg-last", start: 1435, end: 1440, min: GRID_MIN_BLOCK }]), /top:97.917%;height:2.083%/);
});
test("weekly review counts closed blocks, keeps upcoming ones out of the rate and labels durations", () => {
  const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour));
  const block = (status: string, day: number, hour: number, extra: Partial<ReviewEvent> = {}): ReviewEvent => ({ status, startsAt: at(day, hour), endsAt: at(day, hour + 1), taskId: null, habitId: null, actualMinutes: null, ...extra });
  const events = [block("DONE", 5, 9, { habitId: "h" }), block("DONE", 5, 11, { taskId: "t", actualMinutes: 45 }), block("SKIPPED", 5, 13), block("PENDING", 6, 9), block("CANCELLED", 6, 11, { taskId: "t" }), block("CANCELLED", 6, 13), block("IN_PROGRESS", 6, 18), block("PENDING", 7, 9), block("DONE", 20, 9)];
  const summary = summarizeWeek(events, ["2026-10-05", "2026-10-06", "2026-10-07"], value => value.toISOString().slice(0, 10), at(6, 20));
  assert.deepEqual(summary.days[0], { date: "2026-10-05", planned: 3, done: 2, open: 1, upcoming: 0, plannedMinutes: 180, doneMinutes: 105 });
  assert.deepEqual(summary.days.map(day => [day.done, day.open, day.upcoming]), [[2, 1, 0], [0, 3, 0], [0, 0, 1]]);
  assert.deepEqual(summary.kinds, { HABIT: 60, TASK: 45, FIXED: 0 }); assert.equal(summary.rate, 33);
  assert.equal(summarizeWeek([], ["2026-10-05"], value => value.toISOString().slice(0, 10), at(6, 20)).rate, null);
  assert.deepEqual(dayExtremes(summary.days), { best: "2026-10-05", worst: "2026-10-06" }); assert.equal(dayExtremes(summary.days.slice(0, 1)), null);
  assert.equal(minutesLabel(45), "45 min"); assert.equal(minutesLabel(120), "2 h"); assert.equal(minutesLabel(135), "2 h 15 min");
  assert.equal(translator("en")("3 de 4 bloques cerrados"), "3 of 4 closed blocks"); assert.equal(translator("en")("-12 pts frente a la semana anterior"), "-12 pts versus the previous week");
});
test("keyboard move announcement is translated with its interpolations", () => {
  assert.equal(translator("en")("Mover «Informe v1.2» a lunes, 12 de octubre, 14:30. Enter confirma, Escape cancela."), "Move “Informe v1.2” to lunes, 12 de octubre, 14:30. Enter confirms, Escape cancels.");
});
