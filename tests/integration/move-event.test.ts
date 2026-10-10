import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { moveEventTo } from "../../src/lib/calendar";
import { dateOnly } from "../../src/lib/time";
const ids: string[] = [];
async function account(timezone = "UTC") {
  const user = await prisma.user.create({ data: { email: randomUUID() + "@test.invalid", name: "Move", passwordHash: "unused", timezone, dayStart: "08:00", dayEnd: "18:00", onboardingCompleted: true } }); ids.push(user.id); return user;
}
const move = (userId: string, timezone: string, id: string, date: string, time: string) => withUserLock(userId, tx => moveEventTo(tx, userId, timezone, id, date, time));
after(async () => {
  for (const userId of ids) { await prisma.event.deleteMany({ where: { userId } }); await prisma.habitOccurrence.deleteMany({ where: { userId } }); await prisma.habit.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); }
  await prisma.$disconnect();
});
test("moving a block keeps its duration, changes its planning date and fixes it", async () => {
  const user = await account("America/Guayaquil");
  const event = await prisma.event.create({ data: { userId: user.id, title: "Flexible", locked: false, recoveryMinutes: 10, planningDate: dateOnly("2030-04-15"), startsAt: new Date("2030-04-15T14:00Z"), endsAt: new Date("2030-04-15T14:45Z") } });
  await move(user.id, user.timezone, event.id, "2030-04-16", "10:15");
  const moved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(moved.startsAt.toISOString(), "2030-04-16T15:15:00.000Z"); assert.equal(moved.endsAt.toISOString(), "2030-04-16T16:00:00.000Z");
  assert.equal(moved.planningDate?.toISOString().slice(0, 10), "2030-04-16"); assert.equal(moved.locked, true); assert.equal(moved.recoveryMinutes, 0);
});
test("a move onto another block, of a finished block or of another account changes nothing", async () => {
  const user = await account(); const other = await account();
  const busy = await prisma.event.create({ data: { userId: user.id, title: "Busy", startsAt: new Date("2030-04-15T11:00Z"), endsAt: new Date("2030-04-15T12:00Z") } });
  const event = await prisma.event.create({ data: { userId: user.id, title: "Move me", locked: false, startsAt: new Date("2030-04-15T09:00Z"), endsAt: new Date("2030-04-15T10:00Z") } });
  await assert.rejects(move(user.id, "UTC", event.id, "2030-04-15", "10:30"), /coincide/);
  await assert.rejects(move(other.id, "UTC", event.id, "2030-04-15", "14:00"), /no encontrado/);
  await prisma.event.update({ where: { id: busy.id }, data: { status: "DONE" } });
  await assert.rejects(move(user.id, "UTC", busy.id, "2030-04-15", "15:00"), /pendientes/);
  const unchanged = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(unchanged.startsAt.toISOString(), "2030-04-15T09:00:00.000Z"); assert.equal(unchanged.locked, false);
  // Dropping a block back on its own slot is a no-op and keeps it flexible.
  await move(user.id, "UTC", event.id, "2030-04-15", "09:00");
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).locked, false);
});
test("a habit block keeps its day and nonexistent local hours are rejected", async () => {
  const user = await account("America/New_York");
  const habit = await prisma.habit.create({ data: { userId: user.id, title: "Read", durationMinutes: 30, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] } });
  const occurrence = await prisma.habitOccurrence.create({ data: { userId: user.id, habitId: habit.id, date: dateOnly("2030-03-09") } });
  const event = await prisma.event.create({ data: { userId: user.id, title: "Read", source: "HABIT", locked: false, habitId: habit.id, occurrenceId: occurrence.id, planningDate: dateOnly("2030-03-09"), startsAt: new Date("2030-03-09T14:00Z"), endsAt: new Date("2030-03-09T14:30Z") } });
  await assert.rejects(move(user.id, user.timezone, event.id, "2030-03-10", "09:00"), /pertenece a su día/);
  await move(user.id, user.timezone, event.id, "2030-03-09", "11:00");
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).startsAt.toISOString(), "2030-03-09T16:00:00.000Z");
  const plain = await prisma.event.create({ data: { userId: user.id, title: "Plain", startsAt: new Date("2030-03-09T18:00Z"), endsAt: new Date("2030-03-09T19:00Z") } });
  await assert.rejects(move(user.id, user.timezone, plain.id, "2030-03-10", "02:30"), /no existe/);
});
