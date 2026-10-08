import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { insertSeries, replaceFollowingSeries } from "../../src/lib/series";
import { assertFree } from "../../src/lib/calendar";
import { generateDay, runDuePlans } from "../../src/lib/planner";
import { dateOnly } from "../../src/lib/time";
const ids: string[] = [];
async function account() {
  const user = await prisma.user.create({ data: { email: randomUUID() + "@test.invalid", name: "Features", passwordHash: "unused", timezone: "UTC", dayStart: "08:00", dayEnd: "18:00", onboardingCompleted: true } }); ids.push(user.id); return user;
}
const base = { title: "Class", timezone: "UTC", frequency: "DAILY", weekdays: [], startDate: dateOnly("2030-04-15"), until: dateOnly("2030-04-19"), startTime: "09:00", endTime: "10:00", endDayOffset: 0 };
after(async () => {
  for (const userId of ids) { await prisma.event.deleteMany({ where: { userId } }); await prisma.habitOccurrence.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); }
  await prisma.$disconnect();
});
test("series creation rolls back every occurrence if a later appointment conflicts", async () => {
  const user = await account();
  await prisma.event.create({ data: { userId: user.id, title: "Conflict", startsAt: new Date("2030-04-18T09:30Z"), endsAt: new Date("2030-04-18T10:30Z") } });
  await assert.rejects(withUserLock(user.id, async tx => { const series = await tx.eventSeries.create({ data: { ...base, userId: user.id } }); await insertSeries(tx, series); }), /coincide/);
  assert.equal(await prisma.eventSeries.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.event.count({ where: { userId: user.id } }), 1);
});
test("one occurrence remains an exception, splitting preserves history and failed splits are atomic", async () => {
  const user = await account(); const other = await account();
  const series = await withUserLock(user.id, async tx => { const s = await tx.eventSeries.create({ data: { ...base, userId: user.id } }); await insertSeries(tx, s); return s; });
  const events = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
  await withUserLock(user.id, async tx => { await assertFree(tx, user.id, new Date("2030-04-16T11:00Z"), new Date("2030-04-16T12:00Z"), events[1].id); await tx.event.update({ where: { id: events[1].id }, data: { startsAt: new Date("2030-04-16T11:00Z"), endsAt: new Date("2030-04-16T12:00Z") } }); });
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: events[0].id } })).startsAt.toISOString(), "2030-04-15T09:00:00.000Z");
  await assert.rejects(withUserLock(other.id, tx => replaceFollowingSeries(tx, other.id, events[2].id, base)), /no encontrado/);
  await prisma.event.create({ data: { userId: user.id, title: "Keep", startsAt: new Date("2030-04-18T12:00Z"), endsAt: new Date("2030-04-18T13:00Z") } });
  const changed = { ...base, title: "New class", startDate: dateOnly("2030-04-17"), startTime: "12:00", endTime: "13:00" };
  await assert.rejects(withUserLock(user.id, tx => replaceFollowingSeries(tx, user.id, events[2].id, changed)), /coincide/);
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: events[2].id } })).status, "PENDING");
  const next = await withUserLock(user.id, tx => replaceFollowingSeries(tx, user.id, events[2].id, { ...changed, startTime: "14:00", endTime: "15:00" }));
  assert.equal(await prisma.event.count({ where: { seriesId: next.id, status: "PENDING" } }), 3);
  assert.equal(await prisma.event.count({ where: { seriesId: series.id, status: "CANCELLED" } }), 3);
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: events[1].id } })).startsAt.toISOString(), "2030-04-16T11:00:00.000Z");
  await prisma.user.update({ where: { id: user.id }, data: { timezone: "America/Guayaquil" } });
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: events[0].id } })).startsAt.toISOString(), "2030-04-15T09:00:00.000Z");
  await assert.rejects(prisma.event.create({ data: { userId: other.id, seriesId: next.id, recurrenceDate: dateOnly("2030-04-20"), title: "Invalid owner", startsAt: new Date("2030-04-20T09:00Z"), endsAt: new Date("2030-04-20T10:00Z") } }));
});
test("planner protects overnight appointments, travel intervals and minimum rest", async () => {
  const user = await account(); await prisma.user.update({ where: { id: user.id }, data: { dayStart: "00:00", dayEnd: "02:00", bufferMinutes: 10 } });
  await prisma.event.create({ data: { userId: user.id, title: "Night", startsAt: new Date("2030-04-14T23:30Z"), endsAt: new Date("2030-04-15T00:30Z") } });
  const appointment = await prisma.event.create({ data: { userId: user.id, title: "Gym", location: "Gym", travelMinutes: 20, startsAt: new Date("2030-04-15T01:40Z"), endsAt: new Date("2030-04-15T02:00Z") } });
  await assert.rejects(withUserLock(user.id, tx => assertFree(tx, user.id, new Date("2030-04-15T01:15Z"), new Date("2030-04-15T01:30Z"))), /coincide/);
  const task = await prisma.task.create({ data: { userId: user.id, title: "Fits", durationMinutes: 30 } });
  await generateDay(user.id, "2030-04-15", { now: new Date("2030-04-14T20:00Z") });
  const block = await prisma.event.findFirstOrThrow({ where: { taskId: task.id } });
  assert.equal(block.startsAt.toISOString(), "2030-04-15T00:40:00.000Z");
  assert.equal((appointment.startsAt.getTime() - block.endsAt.getTime()) / 60_000, 30);
});
test("deep work uses focus hours and measured history changes estimates without rewriting original task", async () => {
  const user = await account(); await prisma.user.update({ where: { id: user.id }, data: { focusWindow: "AFTERNOON", adaptiveDurations: true } });
  for (let i = 0; i < 3; i++) {
    const task = await prisma.task.create({ data: { userId: user.id, title: "Write", durationMinutes: 40, status: "DONE" } });
    await prisma.event.create({ data: { userId: user.id, taskId: task.id, title: task.title, source: "AUTO", status: "DONE", actualMinutes: 60, estimatedMinutes: 40, startsAt: new Date(`2030-04-${10 + i}T08:00Z`), endsAt: new Date(`2030-04-${10 + i}T08:40Z`) } });
  }
  const deep = await prisma.task.create({ data: { userId: user.id, title: "Write", durationMinutes: 40, energy: "DEEP" } });
  const light = await prisma.task.create({ data: { userId: user.id, title: "Mail", durationMinutes: 30, energy: "LIGHT" } });
  await generateDay(user.id, "2030-04-15", { now: new Date("2030-04-14T20:00Z") });
  const block = await prisma.event.findFirstOrThrow({ where: { taskId: deep.id } }); const mail = await prisma.event.findFirstOrThrow({ where: { taskId: light.id } });
  assert.equal(block.startsAt.toISOString(), "2030-04-15T12:00:00.000Z"); assert.equal(block.estimatedMinutes, 50);
  assert.equal(mail.startsAt.toISOString(), "2030-04-15T08:00:00.000Z"); assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: deep.id } })).durationMinutes, 40);
});
test("worker failures persist with retry time and recover after availability is repaired", async () => {
  const user = await account(); await prisma.user.update({ where: { id: user.id }, data: { autoPlan: true, timezone: "America/New_York", dayStart: "02:30" } });
  const now = new Date("2030-03-10T14:00Z");
  assert.equal((await runDuePlans(now, { userIds: [user.id] })).failed, 1);
  const failure = await prisma.workerRun.findFirstOrThrow({ where: { userId: user.id } }); assert.equal(failure.status, "FAILED"); assert.ok(failure.retryAt! > now);
  assert.equal((await runDuePlans(new Date(now.getTime() + 30_000), { userIds: [user.id] })).failed, 0);
  await prisma.user.update({ where: { id: user.id }, data: { dayStart: "08:00" } });
  assert.equal((await runDuePlans(new Date(now.getTime() + 120_000), { userIds: [user.id] })).generated, 1);
  assert.equal(await prisma.workerRun.count({ where: { userId: user.id, status: "SUCCESS" } }), 1);
});

test("push delivery claims prevent duplicates, retries failed sends and removes expired subscriptions", async () => {
  const { runPushNotifications } = await import("../../src/lib/push");
  const user = await account();
  await prisma.notificationSettings.create({ data: { userId: user.id, dailySummary: false, dueTomorrow: false, leadMinutes: 10 } });
  const subscription = await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(), p256dh: "test", auth: "test", sessionVersion: user.sessionVersion } });
  await prisma.event.create({ data: { userId: user.id, title: "Upcoming", startsAt: new Date("2030-04-15T09:10Z"), endsAt: new Date("2030-04-15T10:00Z") } });
  let sent = 0;
  const transport = async () => { sent++; return { statusCode: 201, body: "", headers: {} }; };
  const options = { userIds: [user.id], send: transport };
  const now = new Date("2030-04-15T09:00Z");
  await Promise.all([runPushNotifications(now, options), runPushNotifications(now, options)]);
  assert.equal(sent, 1);
  assert.equal(await prisma.pushDelivery.count({ where: { subscriptionId: subscription.id, sentAt: { not: null } } }), 1);
  await prisma.event.create({ data: { userId: user.id, title: "Retry", startsAt: new Date("2030-04-16T09:10Z"), endsAt: new Date("2030-04-16T10:00Z") } });
  const retryNow = new Date("2030-04-16T09:00Z");
  const failed = await runPushNotifications(retryNow, { ...options, send: async () => { throw { statusCode: 503 }; } }); assert.equal(failed.failed, 1);
  await runPushNotifications(new Date(retryNow.getTime() + 30_000), options); assert.equal(sent, 1);
  await runPushNotifications(new Date(retryNow.getTime() + 180_000), options); assert.equal(sent, 2);
  await prisma.event.create({ data: { userId: user.id, title: "Expired", startsAt: new Date("2030-04-17T09:10Z"), endsAt: new Date("2030-04-17T10:00Z") } });
  await runPushNotifications(new Date("2030-04-17T09:00Z"), { ...options, send: async () => { throw { statusCode: 410 }; } });
  assert.equal(await prisma.pushSubscription.count({ where: { id: subscription.id } }), 0);
  await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(), p256dh: "test", auth: "test", sessionVersion: user.sessionVersion - 1 } });
  await runPushNotifications(new Date("2030-04-17T09:00Z"), options);
  assert.equal(await prisma.pushSubscription.count({ where: { userId: user.id } }), 0); assert.equal(sent, 2);
});
