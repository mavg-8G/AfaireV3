import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { generateDay, runDuePlans } from "../../src/lib/planner";
import { withUserLock } from "../../src/lib/transaction";
import { assertFree, ownedEvent, setEventStatus } from "../../src/lib/calendar";
import { dateOnly } from "../../src/lib/time";

const day = "2030-04-15"; const now = new Date(day + "T07:00:00Z");
const ids: string[] = [];
after(async () => {
  for (const userId of ids) {
    await prisma.event.deleteMany({ where: { userId } });
    await prisma.habitOccurrence.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});
test("PostgreSQL calendar invariants and daily generation", async t => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: suffix + "@test.invalid", name: "Test", passwordHash: "unused", timezone: "UTC", dayStart: "08:00", dayEnd: "18:00", bufferMinutes: 10, onboardingCompleted: true } }); ids.push(user.id);
  const other = await prisma.user.create({ data: { email: "other-" + suffix + "@test.invalid", name: "Other", passwordHash: "unused", timezone: "America/Guayaquil" } }); ids.push(other.id);
  const fixed = await prisma.event.create({ data: { userId: user.id, title: "Fixed appointment", startsAt: new Date(day + "T09:00:00Z"), endsAt: new Date(day + "T10:00:00Z") } });
  const habit = await prisma.habit.create({ data: { userId: user.id, title: "Essential habit", durationMinutes: 30, daysOfWeek: [0,1,2,3,4,5,6], required: true } });
  const task = await prisma.task.create({ data: { userId: user.id, title: "Inbox task", durationMinutes: 45 } });
  const tomorrowTask = await prisma.task.create({ data: { userId: user.id, title: "Reserved tomorrow", durationMinutes: 30, status: "SCHEDULED" } });
  await prisma.event.create({ data: { userId: user.id, title: tomorrowTask.title, source: "AUTO", taskId: tomorrowTask.id, locked: false, planningDate: dateOnly("2030-04-16"), startsAt: new Date("2030-04-16T11:00:00Z"), endsAt: new Date("2030-04-16T11:30:00Z") } });

  await t.test("plans around fixed appointments without duplicating future tasks", async () => {
    const result = await generateDay(user.id, day, { now }); assert.equal(result.placed, 2);
    assert.equal(await prisma.event.count({ where: { taskId: tomorrowTask.id, status: "PENDING" } }), 1);
    const kept = await prisma.event.findUniqueOrThrow({ where: { id: fixed.id } }); assert.equal(kept.startsAt.toISOString(), day + "T09:00:00.000Z");
  });
  await t.test("repeated and simultaneous plans remain deterministic and unique", async () => {
    const before = await prisma.event.findMany({ where: { userId: user.id, planningDate: dateOnly(day) }, orderBy: { startsAt: "asc" } });
    await Promise.all([generateDay(user.id, day, { now }), generateDay(user.id, day, { now })]);
    const after = await prisma.event.findMany({ where: { userId: user.id, planningDate: dateOnly(day) }, orderBy: { startsAt: "asc" } });
    assert.deepEqual(after.map(e => [e.title, e.startsAt.toISOString()]), before.map(e => [e.title, e.startsAt.toISOString()]));
    assert.equal(await prisma.habitOccurrence.count({ where: { habitId: habit.id, date: dateOnly(day) } }), 1);
    assert.equal(await prisma.event.count({ where: { taskId: task.id, status: "PENDING" } }), 1);
  });
  await t.test("completed habit and manually fixed generated task survive replanning", async () => {
    const h = await prisma.event.findFirstOrThrow({ where: { userId: user.id, habitId: habit.id, planningDate: dateOnly(day) } });
    const taskEvent = await prisma.event.findFirstOrThrow({ where: { taskId: task.id } });
    await withUserLock(user.id, async tx => { await setEventStatus(tx, user.id, h.id, "DONE"); await tx.event.update({ where: { id: taskEvent.id }, data: { locked: true } }); });
    await generateDay(user.id, day, { now: new Date(day + "T08:15:00Z") });
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: h.id } })).status, "DONE");
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: taskEvent.id } })).source, "AUTO");
    assert.equal(await prisma.event.count({ where: { habitId: habit.id, planningDate: dateOnly(day) } }), 1);
  });
  await t.test("user ownership and database foreign keys isolate accounts", async () => {
    await assert.rejects(withUserLock(other.id, tx => ownedEvent(tx, other.id, fixed.id)), /no encontrado/);
    await assert.rejects(prisma.event.create({ data: { userId: other.id, title: "Invalid link", source: "AUTO", taskId: task.id, startsAt: new Date("2031-01-01T08:00:00Z"), endsAt: new Date("2031-01-01T09:00:00Z") } }));
    assert.equal(await prisma.event.count({ where: { userId: other.id } }), 0);
  });
  await t.test("concurrent overlapping edits permit exactly one write", async () => {
    const writes = await Promise.allSettled([0, 30].map(offset => withUserLock(user.id, async tx => {
      const startsAt = new Date(day + (offset ? "T20:30:00Z" : "T20:00:00Z")); const endsAt = new Date(startsAt.getTime() + 3600_000);
      await assertFree(tx, user.id, startsAt, endsAt);
      return tx.event.create({ data: { userId: user.id, title: "Concurrent", startsAt, endsAt } });
    })));
    assert.equal(writes.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(writes.filter(r => r.status === "rejected").length, 1);
    await assert.rejects(prisma.event.create({ data: { userId: user.id, title: "DB overlap", startsAt: fixed.startsAt, endsAt: fixed.endsAt } }));
  });
  await t.test("skipped habits do not return and pending tasks retain identity", async () => {
    const next = "2030-04-17"; await generateDay(user.id, next, { now });
    const h = await prisma.event.findFirstOrThrow({ where: { userId: user.id, habitId: habit.id, planningDate: dateOnly(next) } });
    await withUserLock(user.id, tx => setEventStatus(tx, user.id, h.id, "SKIPPED"));
    await generateDay(user.id, next, { now });
    assert.equal(await prisma.event.count({ where: { habitId: habit.id, planningDate: dateOnly(next), status: "PENDING" } }), 0);
    const overdue = await prisma.task.create({ data: { userId: user.id, title: "Overdue", durationMinutes: 20, status: "SCHEDULED" } });
    const old = await prisma.event.create({ data: { userId: user.id, taskId: overdue.id, title: overdue.title, source: "AUTO", locked: false, planningDate: dateOnly("2030-04-14"), startsAt: new Date("2030-04-14T13:00:00Z"), endsAt: new Date("2030-04-14T13:20:00Z") } });
    await generateDay(user.id, day, { now });
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: old.id } })).status, "CANCELLED");
    assert.equal(await prisma.event.count({ where: { taskId: overdue.id, status: "PENDING" } }), 1);
  });
  await t.test("daily worker generates without an open session and leaves existing plans alone", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { autoPlan: true } });
    const workerNow = new Date("2030-04-18T08:01:00Z");
    const first = await runDuePlans(workerNow, { userIds: [user.id] }); assert.ok(first.generated >= 1);
    const plan = await prisma.dayPlan.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: dateOnly("2030-04-18") } } });
    await runDuePlans(workerNow, { userIds: [user.id] });
    const kept = await prisma.dayPlan.findUniqueOrThrow({ where: { id: plan.id } }); assert.equal(kept.version, plan.version);
  });
  await t.test("past dates are read only for the planner", async () => {
    await assert.rejects(generateDay(user.id, "2030-04-14", { now }), /hoy o una fecha futura/);
  });
});
