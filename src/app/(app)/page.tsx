import { feedbackPolicy } from "@/lib/plan-feedback";
import { CategoryProgress } from "@/components/CategoryProgress";
import { UnscheduledActions } from "@/components/UnscheduledActions";
import { PlanHistory } from "@/components/PlanHistory";
import { PlanFeedbackForm } from "@/components/PlanFeedbackForm";
import { displayClock, displayDay, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { CapacityWarnings } from "@/components/CapacityWarnings";
import { ActionButton } from "@/components/ActionButton";
import { setDayMode } from "@/app/actions/planning-options";
import { OfflineDaySync } from "@/components/OfflineDaySync";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { calendarDayBounds, ymdInZone, weekdayForDate, dateOnly, roundUp, addMinutesUtc, addLocalDays } from "@/lib/time";
import { availabilityWindows, availabilitySummary } from "@/lib/availability";
import { computeGaps } from "@/lib/scheduler";
import type { Unscheduled } from "@/lib/planner";
import { EventForm } from "@/components/EventForm";
import { EventCard } from "@/components/EventCard";
import { PlanButton } from "@/components/PlanButton";
import { NowBanner } from "@/components/NowBanner";
import { DateNavigator } from "@/components/DateNavigator";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser();
  if (!user.onboardingCompleted) redirect("/onboarding");
  const params = await searchParams; const now = new Date(); const today = ymdInZone(now, user.timezone);
  const parsed = DateSchema.safeParse(params.date ?? today); if (!parsed.success) notFound();
  const signal = feedbackPolicy(await prisma.planFeedback.findMany({where:{userId:user.id,date:{gte:dateOnly(addLocalDays(today,-28)),lte:dateOnly(today)}}}));
  const effectiveSlack = Math.min(50,user.slackPercent+signal.extraSlack);
  const date = parsed.data; const bounds = calendarDayBounds(date, user.timezone);
  const override = await prisma.dayOverride.findUnique({ where: { userId_date: { userId: user.id, date: dateOnly(date) } } });
  const windows = availabilityWindows(user, date, user.timezone, override);
  const [busyEvents, plan, inboxCount] = await Promise.all([
    prisma.event.findMany({ where: { userId: user.id, status: { not: "CANCELLED" }, startsAt: { lt: addMinutesUtc(bounds.end, user.bufferMinutes + 180) }, endsAt: { gt: addMinutesUtc(bounds.start, -user.bufferMinutes - 180) } }, orderBy: { startsAt: "asc" }, include: { series: true } }),
    prisma.dayPlan.findUnique({ where: { userId_date: { userId: user.id, date: dateOnly(date) } } }),
    prisma.task.count({ where: { userId: user.id, archived: false, status: "INBOX" } }),
  ]);
  const events = busyEvents.filter(event => event.startsAt < bounds.end && event.endsAt > bounds.start);
  const free = date < today ? 0 : windows.flatMap(window => computeGaps(date === today ? new Date(Math.max(roundUp(now).getTime(), window.start.getTime())) : window.start, window.end, busyEvents.filter(e => e.status !== "SKIPPED"), user.bufferMinutes)).reduce((sum, gap) => sum + (gap.end.getTime() - gap.start.getTime()) / 60_000, 0);
  const active = events.filter(event => event.status !== "SKIPPED"); const done = active.filter(event => event.status === "DONE").length;
  const details = Array.isArray(plan?.details) ? plan.details as unknown as Unscheduled[] : [];
  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-[.22em] text-sage">{date === today ? t(`Hola, ${user.name.split(" ")[0]}`) : t("Tu agenda")}</p><h1 className="mt-3 text-4xl first-letter:uppercase sm:text-5xl">{displayDay(date, user.timezone, preferences)}</h1><p className="mt-3 text-sm text-muted">{override?.paused ? t("Planificador pausado") : override?.startTime ? `${displayClock(override.startTime, preferences)}–${displayClock(override.endTime!, preferences)}${t(" · horario temporal")}` : t(availabilitySummary(user, weekdayForDate(date), value => displayClock(value, preferences)))} · {user.timezone}</p>{user.adaptiveAvailability && <Link href="/settings" className="mt-2 inline-block text-xs text-sage">{t("Disponibilidad que aprende contigo ↗")}</Link>}</div><PlanButton date={date} existing={Boolean(plan)} disabled={date < today || !windows.length} /></div>
    <DateNavigator date={date} today={today} />
    <PlanHistory userId={user.id} day={date} timezone={user.timezone} />
    <CategoryProgress userId={user.id} day={date} />
    {date <= today && date >= addLocalDays(today,-28) && <div className="grid items-start gap-3 sm:grid-cols-2"><Link href={`/check-in?date=${date}`} className="flex min-h-14 items-center rounded-2xl border border-line bg-card p-4 text-sm text-sage">{t("Chequeo de fin de día · ¿qué pasó hoy?")}</Link><PlanFeedbackForm day={date} events={events.filter(event=>event.taskId||event.habitId).map(event=>({id:event.id,title:event.title}))} /></div>}
    {date >= today && <CapacityWarnings userId={user.id} day={date} />}
    {date >= today && windows.length > 0 && <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4 text-sm"><p>{t("Capacidad: ")}{override?.capacityPercent ?? 100} %{override?.essentialOnly ? t(" · esenciales y urgentes") : ""} {t(" · holgura ")}{effectiveSlack} %{signal.extraSlack > 0 && <span className="ml-2 text-xs text-sage">{t("incluye tu feedback reciente")}</span>}</p><ActionButton action={setDayMode.bind(null,date,"NORMAL")}>{t("Día normal")}</ActionButton><ActionButton action={setDayMode.bind(null,date,"SHORT")}>{t("Hoy tengo poco tiempo · 50 %")}</ActionButton><ActionButton action={setDayMode.bind(null,date,"DIFFICULT")}>{t("Día difícil · 30 %")}</ActionButton></section>}{date === today && <OfflineDaySync revision={events.map(e => `${e.id}:${e.updatedAt.toISOString()}`).join("|")} />}
    {date === today && <NowBanner events={events} timezone={user.timezone} now={now} />}
    <div className="grid grid-cols-3 gap-3">{[[String(active.length), t("bloques en tu día")], [`${done}/${active.length}`, t("completados")], [String(Math.floor(free)), t("minutos sin asignar")]].map(([value, label]) => <div key={label} className="rounded-2xl border border-line bg-card px-4 py-4"><p className="display text-3xl">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div>)}</div>
    {details.length > 0 && <section className="rounded-2xl border border-gold/40 bg-pending p-5"><h2 className="text-xl">{t("Quedó pendiente de encontrar su lugar")}</h2><ul className="mt-3 space-y-4 text-sm">{details.map(item => <li key={item.key}><span className="font-medium">{item.title}{item.required ? " · Esencial" : ""}</span><span className="mt-0.5 block text-xs text-muted">{t(item.reason)}</span>{date >= today && <UnscheduledActions item={item} day={date} timezone={user.timezone} planVersion={plan!.version} />}</li>)}</ul></section>}
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]"><section className="space-y-3"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl">{t("El recorrido del día")}</h2><span className="text-xs text-muted">{t("Fijo ")}<span className="text-terracotta">●</span> {t(" · Flexible ")}<span className="text-sage">●</span></span></div>
      {!events.length ? <div className="rounded-3xl border border-dashed border-line bg-card/40 px-6 py-14 text-center"><span className="display text-4xl text-sage">✦</span><h3 className="mt-4 text-xl">{t("Un día por organizar")}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{t("Añade tus citas, prepara tus hábitos y pulsa «Organizar mi día» para darles un lugar.")}</p><Link href="/habits" className="mt-5 inline-block text-sm text-sage underline underline-offset-4">{t("Preparar mis rutinas →")}</Link></div> : events.map(event => <EventCard key={event.id} event={event} timezone={user.timezone} />)}
    </section><aside className="space-y-4"><EventForm key={date} date={date} /><Link href="/inbox" className="block rounded-2xl border border-line bg-card p-5"><p className="text-xs uppercase tracking-widest text-muted">{t("Tu bandeja")}</p><p className="mt-2 text-lg">{inboxCount} {t(" tareas por organizar ")}<span className="text-sage">↗</span></p><p className="mt-1 text-xs text-muted">{t("Sin hora todavía. El próximo plan buscará un hueco.")}</p></Link>{plan && <p className="px-2 text-xs text-muted">{t("Plan actualizado · versión ")}{plan.version}</p>}</aside></div>
  </div>;
}
