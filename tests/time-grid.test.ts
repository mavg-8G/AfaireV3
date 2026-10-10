import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDayBounds } from "../src/lib/time";
import { assignLanes, clampStart, gridClass, gridCss, gridRange, minuteHm, minuteInDay, shiftSlot, snapMinute } from "../src/lib/time-grid";
import { translator } from "../src/lib/locale";

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
  assert.equal(css, ".tg-body{height:39rem}.tg-a-0{top:25%;height:8.333%;left:50%;width:50%}.tg-b-0{display:none}");
  assert.match(css, /^[A-Za-z0-9_.:;%{}-]+$/);
});
test("keyboard move announcement is translated with its interpolations", () => {
  assert.equal(translator("en")("Mover «Informe v1.2» a lunes, 12 de octubre, 14:30. Enter confirma, Escape cancela."), "Move “Informe v1.2” to lunes, 12 de octubre, 14:30. Enter confirms, Escape cancels.");
});
