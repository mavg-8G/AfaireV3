import { displayClock, displayDay, displayTime, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { CapacityWarnings } from "@/components/CapacityWarnings";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { startOfLocalWeek, addLocalDays, calendarDayBounds, ymdInZone, dateOnly } from "@/lib/time";
import { DateNavigator } from "@/components/DateNavigator";
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone); const params = await searchParams;
  const parsed = DateSchema.safeParse(params.start ?? startOfLocalWeek(today, user.weekStartsOn)); if (!parsed.success) notFound();
  const start = startOfLocalWeek(parsed.data, user.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => { const date = addLocalDays(start, i); return { date, bounds: calendarDayBounds(date, user.timezone) }; });
  const overrides = await prisma.dayOverride.findMany({ where: { userId: user.id, date: { gte: dateOnly(days[0].date), lte: dateOnly(days[6].date) } } });
  const events = await prisma.event.findMany({ where: { userId: user.id, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: days[6].bounds.end }, endsAt: { gt: days[0].bounds.start } }, orderBy: { startsAt: "asc" } });
  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-widest text-sage">{t("Una mirada más amplia")}</p><h1 className="mt-3 text-4xl">{t("Tu semana")}</h1><p className="mt-3 text-sm text-muted">{t("Abre cualquier día para editarlo u organizar lo que falta.")}</p></div><DateNavigator date={start} today={today} week />
    {days[6].date >= today && <CapacityWarnings userId={user.id} day={start < today ? today : start} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">{days.map(day => {
      const items = events.filter(e => e.startsAt < day.bounds.end && e.endsAt > day.bounds.start); const isToday = day.date === today; const override = overrides.find(o => o.date.getTime() === dateOnly(day.date).getTime());
      return <Link key={day.date} href={`/?date=${day.date}`} className={`min-h-48 rounded-2xl border p-4 transition hover:shadow-sm ${isToday ? "border-sage bg-card" : "border-line bg-card/70"}`}><p className={`text-xs capitalize ${isToday ? "text-sage" : "text-muted"}`}>{displayDay(day.date, user.timezone, preferences).split(" ")[0]}{isToday ? t(" · hoy") : ""}</p><p className="mt-1 display text-3xl">{Number(day.date.slice(-2))}</p>{override && <p className="mt-2 text-xs text-sage">{override.label ?? t("Día especial")} · {override.paused ? t("Pausado") : override.startTime ? `${displayClock(override.startTime, preferences)}–${displayClock(override.endTime!, preferences)}` : `${override.capacityPercent} %`}</p>}<ul className="mt-4 space-y-2">{!items.length && <li className="text-xs text-muted">{t("Espacio libre")}</li>}{items.map(event => <li key={event.id} className={`rounded-lg border-l-2 bg-paper/60 p-2 text-xs ${event.locked ? "border-terracotta" : "border-sage"} `}><span className="tabular-nums text-muted">{event.startsAt < day.bounds.start ? t("Desde ayer") : displayTime(event.startsAt, user.timezone, preferences)}</span><span className="mt-1 block break-words leading-relaxed">{event.title}{event.status === "DONE" ? " ✓" : ""}</span></li>)}</ul></Link>;
    })}</div></div>;
}
