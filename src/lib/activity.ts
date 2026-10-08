import { withUserLock } from "./transaction";
import { dateOnly, formatTime, weekdayForDate, ymdInZone } from "./time";
import { learnAvailability } from "./learning";

export async function recordActivity(userId: string, now = new Date()) {
  return withUserLock(userId, async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { availability: true } });
    if (!user.adaptiveAvailability) return;
    const day = ymdInZone(now, user.timezone);
    const [hours, minutes] = formatTime(now, user.timezone).split(":").map(Number);
    const minute = Math.floor((hours * 60 + minutes) / 15) * 15;
    const created = await tx.usageSample.createMany({
      data: [{ userId, date: dateOnly(day), weekday: weekdayForDate(day), minute, timezone: user.timezone, observedAt: now }], skipDuplicates: true,
    });
    if (!created.count) return;
    const cutoff = new Date(now.getTime() - 28 * 86400_000);
    await tx.usageSample.deleteMany({ where: { userId, OR: [{ observedAt: { lt: cutoff } }, { timezone: { not: user.timezone } }] } });
    const samples = await tx.usageSample.findMany({ where: { userId, observedAt: { gte: cutoff, lte: now }, timezone: user.timezone }, select: { date: true, weekday: true, minute: true } });
    const initial = Array.from({ length: 7 }, (_, weekday) => {
      const row = user.availability.find(value => value.weekday === weekday);
      return { weekday, active: row?.active ?? true, start: row?.start ?? user.dayStart, end: row?.end ?? user.dayEnd };
    });
    for (const learned of learnAvailability(samples, initial)) {
      const data = { learnedWindows: learned.windows, learnedActive: learned.active, learningReason: learned.reason, learnedAt: learned.reason ? now : null };
      const row = initial.find(value => value.weekday === learned.weekday)!;
      await tx.availability.upsert({ where: { userId_weekday: { userId, weekday: learned.weekday } }, create: { userId, ...row, ...data }, update: data });
    }
  });
}
