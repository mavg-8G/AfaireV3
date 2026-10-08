import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { addLocalDays, weekdayForDate, calendarDayBounds, formatTime, formatDayHeading, ymdInZone } from "@/lib/time";
import { DateNavigator } from "@/components/DateNavigator";
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone); const params = await searchParams;
  const parsed = DateSchema.safeParse(params.start ?? addLocalDays(today, -(weekdayForDate(today) + 6) % 7)); if (!parsed.success) notFound();
  const days = Array.from({ length: 7 }, (_, i) => { const date = addLocalDays(parsed.data, i); return { date, bounds: calendarDayBounds(date, user.timezone) }; });
  const events = await prisma.event.findMany({ where: { userId: user.id, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: days[6].bounds.end }, endsAt: { gt: days[0].bounds.start } }, orderBy: { startsAt: "asc" } });
  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-widest text-sage">Una mirada más amplia</p><h1 className="mt-3 text-4xl">Tu semana</h1><p className="mt-3 text-sm text-muted">Abre cualquier día para editarlo u organizar lo que falta.</p></div><DateNavigator date={parsed.data} today={today} week />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">{days.map(day => {
      const items = events.filter(e => e.startsAt < day.bounds.end && e.endsAt > day.bounds.start); const isToday = day.date === today;
      return <Link key={day.date} href={`/?date=${day.date}`} className={`min-h-48 rounded-2xl border p-4 transition hover:shadow-sm ${isToday ? "border-sage bg-card" : "border-line bg-card/70"}`}><p className={`text-xs capitalize ${isToday ? "text-sage" : "text-muted"}`}>{formatDayHeading(day.date, user.timezone).split(" ")[0]}{isToday ? " · hoy" : ""}</p><p className="mt-1 display text-3xl">{Number(day.date.slice(-2))}</p><ul className="mt-4 space-y-2">{!items.length && <li className="text-xs text-muted">Espacio libre</li>}{items.map(event => <li key={event.id} className={`rounded-lg border-l-2 bg-paper/60 p-2 text-xs ${event.locked ? "border-terracotta" : "border-sage"} ${event.status === "DONE" ? "opacity-60" : ""}`}><span className="tabular-nums text-muted">{event.startsAt < day.bounds.start ? "Desde ayer" : formatTime(event.startsAt, user.timezone)}</span><span className="mt-1 block break-words leading-relaxed">{event.title}{event.status === "DONE" ? " ✓" : ""}</span></li>)}</ul></Link>;
    })}</div></div>;
}
