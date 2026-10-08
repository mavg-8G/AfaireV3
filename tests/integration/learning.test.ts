import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { recordActivity } from "../../src/lib/activity";
import { generateDay, runDuePlans } from "../../src/lib/planner";
import { effectiveMinutes } from "../../src/lib/availability";
import { dateOnly } from "../../src/lib/time";

const ids: string[] = [];
after(async () => {
  for (const userId of ids) {
    await prisma.event.deleteMany({ where: { userId } });
    await prisma.habitOccurrence.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});
test("persistent usage learning and nocturnal scheduling", async t => {
  const user = await prisma.user.create({ data: { email: randomUUID() + "@test.invalid", name: "Learning test", passwordHash: "unused", timezone: "America/Guayaquil", autoPlan: true, onboardingCompleted: true } }); ids.push(user.id);
  await t.test("server timestamps use the user's timezone and deduplicate quarter-hour buckets", async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordActivity(user.id, new Date("2030-04-13T06:00:00Z"))));
    const samples = await prisma.usageSample.findMany({ where: { userId: user.id } });
    assert.equal(samples.length, 1); assert.equal(samples[0].minute, 60); assert.equal(samples[0].date.toISOString().slice(0,10), "2030-04-13");
    const first = await prisma.availability.findMany({ where: { userId: user.id } });
    assert.ok(first.every(row => Array.isArray(row.learnedWindows) && !row.learnedWindows.length));
  });
  await t.test("repeated nocturnal visits learn multiple windows and worker can plan at 1am", async () => {
    await recordActivity(user.id, new Date("2030-04-14T06:00:00Z"));
    await recordActivity(user.id, new Date("2030-04-15T06:00:00Z"));
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { availability: true } });
    assert.deepEqual(effectiveMinutes(profile, 1), [{ start: 30, end: 150 }, { start: 480, end: 1320 }]);
    const task = await prisma.task.create({ data: { userId: user.id, title: "Night task", durationMinutes: 30 } });
    const now = new Date("2030-04-15T06:10:00Z");
    const result = await runDuePlans(now, { userIds: [user.id] }); assert.equal(result.generated, 1);
    const event = await prisma.event.findFirstOrThrow({ where: { userId: user.id, taskId: task.id } });
    assert.equal(event.startsAt.toISOString(), "2030-04-15T06:10:00.000Z");
    const plan = await prisma.dayPlan.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: dateOnly("2030-04-15") } } });
    await recordActivity(user.id, new Date("2030-04-15T07:00:00Z"));
    assert.equal((await prisma.dayPlan.findUniqueOrThrow({ where: { id: plan.id } })).version, plan.version);
  });
  await t.test("opting out stops observations and restores initial availability", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { adaptiveAvailability: false } });
    const before = await prisma.usageSample.count({ where: { userId: user.id } });
    await recordActivity(user.id, new Date("2030-04-16T06:00:00Z"));
    assert.equal(await prisma.usageSample.count({ where: { userId: user.id } }), before);
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { availability: true } });
    assert.deepEqual(effectiveMinutes(profile, 1), [{ start: 480, end: 1320 }]);
    const task = await prisma.task.create({ data: { userId: user.id, title: "Day task", durationMinutes: 30 } });
    await generateDay(user.id, "2030-04-16", { now: new Date("2030-04-16T06:00:00Z") });
    const scheduled = await prisma.event.findFirstOrThrow({ where: { taskId: task.id } });
    assert.ok(scheduled.startsAt >= new Date("2030-04-16T13:00:00Z"));
    assert.ok(scheduled.endsAt <= new Date("2030-04-17T03:00:00Z"));
  });
  await t.test("old samples expire on the next observation", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { adaptiveAvailability: true } });
    await prisma.usageSample.create({ data: { userId: user.id, date: dateOnly("2030-03-01"), weekday: 5, minute: 60, timezone: "America/Guayaquil", observedAt: new Date("2030-03-01T06:00:00Z") } });
    await recordActivity(user.id, new Date("2030-04-16T06:00:00Z"));
    assert.equal(await prisma.usageSample.count({ where: { userId: user.id, observedAt: { lt: new Date("2030-03-19T06:00:00Z") } } }), 0);
  });
});
