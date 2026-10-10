import { displayClock, displayDay, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { CapacityWarnings } from "@/components/CapacityWarnings";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { startOfLocalWeek, addLocalDays, calendarDayBounds, ymdInZone, dateOnly } from "@/lib/time";
import { DateNavigator } from "@/components/DateNavigator";
import { TimeGrid } from "@/components/TimeGrid";
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const now = new Date(); const today = ymdInZone(now, user.timezone); const params = await searchParams;
  const parsed = DateSchema.safeParse(params.start ?? startOfLocalWeek(today, user.weekStartsOn)); if (!parsed.success) notFound();
  const start = startOfLocalWeek(parsed.data, user.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => { const date = addLocalDays(start, i); return { date, bounds: calendarDayBounds(date, user.timezone) }; });
  const overrides = await prisma.dayOverride.findMany({ where: { userId: user.id, date: { gte: dateOnly(days[0].date), lte: dateOnly(days[6].date) } } });
  const events = await prisma.event.findMany({ where: { userId: user.id, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: days[6].bounds.end }, endsAt: { gt: days[0].bounds.start } }, orderBy: { startsAt: "asc" } });
  return <div className="space-y-6"><div><p className="eyebrow">{t("Una mirada más amplia")}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("Tu semana")}</h1><p className="mt-3 text-sm text-muted">{t("Arrastra los bloques pendientes para reubicarlos o abre un día para editarlo y organizar lo que falta.")}</p></div><DateNavigator date={start} today={today} week />
    {days[6].date >= today && <CapacityWarnings userId={user.id} day={start < today ? today : start} />}
    {overrides.length > 0 && <ul className="flex flex-wrap gap-2 text-xs">{overrides.map(override => <li key={override.id} className="rounded-full bg-sage-soft px-3 py-1.5 text-sage"><span className="capitalize">{displayDay(override.date.toISOString().slice(0, 10), user.timezone, preferences)}</span> · {override.label ?? t("Día especial")} · {override.paused ? t("Pausado") : override.startTime ? `${displayClock(override.startTime, preferences)}–${displayClock(override.endTime!, preferences)}` : `${override.capacityPercent} %`}</li>)}</ul>}
    <TimeGrid profile={user} timezone={user.timezone} preferences={preferences} dates={days.map(day => day.date)} today={today} now={now} events={events} overrides={overrides} />
  </div>;
}
