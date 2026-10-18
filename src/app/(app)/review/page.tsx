import { getRequestPreferences } from "@/lib/request-preferences";
import { displayTime, translator, weekdayLabel } from "@/lib/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { startOfLocalWeek, addLocalDays, calendarDayBounds, dateOnly, weekdayForDate, ymdInZone } from "@/lib/time";
import { habitStats } from "@/lib/insights";
import { dayExtremes, minutesLabel, reviewOutcome, scheduledMinutes, summarizeWeek } from "@/lib/weekly-review";

const card = "rounded-2xl border border-line bg-card p-5 shadow-sm";
const MOODS: Record<string, { label: string; tone: string }> = { OK: { label: "Bien", tone: "bg-sage-soft text-sage" }, BUSY: { label: "Demasiado lleno", tone: "bg-pending text-gold" }, DIFFICULT: { label: "Día difícil", tone: "bg-pending text-terracotta" } };
const OPEN_LABELS: Record<string, string> = { SKIPPED: "Omitido", POSTPONED: "Pospuesto", MISSED: "Sin completar" };
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const now = new Date(); const today = ymdInZone(now, user.timezone); const params = await searchParams;
  const monday = startOfLocalWeek(today, user.weekStartsOn); const weekBounds = (first: string) => ({ start: calendarDayBounds(first, user.timezone).start, end: calendarDayBounds(addLocalDays(first, 6), user.timezone).end });
  // Without an explicit week, review the one that just ended; a new account has nothing there yet, so show the week in progress.
  let fallback = addLocalDays(monday, -7);
  if (!params.start) { const last = weekBounds(fallback); if (!await prisma.event.count({ where: { userId: user.id, startsAt: { gte: last.start, lt: last.end } } })) fallback = monday; }
  const parsed = DateSchema.safeParse(params.start ?? fallback); if (!parsed.success) notFound();
  const start = startOfLocalWeek(parsed.data, user.weekStartsOn); const end = addLocalDays(start, 6); const dates = Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
  const bounds = weekBounds(start); const previous = weekBounds(addLocalDays(start, -7)); const current = start === monday;
  const [events, before, habits, completed, plans, checkIns] = await Promise.all([
    prisma.event.findMany({ where: { userId: user.id, startsAt: { gte: bounds.start, lt: bounds.end } }, orderBy: { startsAt: "asc" } }),
    prisma.event.findMany({ where: { userId: user.id, startsAt: { gte: previous.start, lt: previous.end } }, select: { status: true, startsAt: true, endsAt: true, taskId: true, habitId: true, actualMinutes: true, minimal: true } }),
    prisma.habit.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" } }),
    prisma.habitOccurrence.findMany({ where: { userId: user.id, status: "DONE" }, select: { habitId: true, date: true } }),
    prisma.dayPlan.findMany({ where: { userId: user.id, date: { gte: dateOnly(start), lte: dateOnly(end) } } }),
    prisma.dayCheckIn.findMany({ where: { userId: user.id, date: { gte: dateOnly(start), lte: dateOnly(end) } }, orderBy: { date: "asc" } }),
  ]);
  const dayOf = (value: Date) => ymdInZone(value, user.timezone);
  const summary = summarizeWeek(events, dates, dayOf, now); const { total } = summary; const closed = total.done + total.open;
  const lastRate = summarizeWeek(before, dates.map(date => addLocalDays(date, -7)), dayOf, now).rate;
  const delta = summary.rate !== null && lastRate !== null ? summary.rate - lastRate : null;
  const outcomes = events.map(event => ({ event, outcome: reviewOutcome(event, now) }));
  const done = outcomes.filter(value => value.outcome === "DONE").map(value => value.event);
  const open = outcomes.filter(value => value.outcome === "SKIPPED" || value.outcome === "POSTPONED" || value.outcome === "MISSED");
  const missedCount = open.filter(value => value.outcome === "MISSED").length;
  const measured = done.filter(event => event.actualMinutes !== null);
  const estimateOf = (event: (typeof events)[number]) => event.estimatedMinutes ?? scheduledMinutes(event);
  const actual = measured.reduce((sum, event) => sum + event.actualMinutes!, 0); const estimated = measured.reduce((sum, event) => sum + estimateOf(event), 0);
  const missing = plans.reduce((sum, plan) => sum + plan.skipped.length, 0);
  const lastDay = end < today ? end : today;
  const rows = start > today ? [] : habits.map(habit => {
    const doneDays = new Set(completed.filter(value => value.habitId === habit.id).map(value => value.date.toISOString().slice(0, 10))); const created = ymdInZone(habit.createdAt, user.timezone); const weekly = habit.frequencyMode === "WEEKLY";
    const marks = dates.map(date => ({ date, state: doneDays.has(date) ? "done" : weekly || date < created || !habit.daysOfWeek.includes(weekdayForDate(date)) ? "off" : date < today ? "missed" : "due" }));
    return { habit, weekly, marks, ...habitStats(habit.daysOfWeek, start, lastDay, created, doneDays, today, weekly ? habit.weeklyTarget : undefined, user.weekStartsOn) };
  });
  const habitDone = rows.reduce((sum, row) => sum + row.done, 0); const habitExpected = rows.reduce((sum, row) => sum + row.expected, 0);
  const moods = new Map(checkIns.map(value => [value.date.toISOString().slice(0, 10), value])); const notes = checkIns.filter(value => value.note);
  const dayLabel = new Intl.DateTimeFormat(preferences.locale, { weekday: "short", day: "numeric", timeZone: "UTC" }); const narrow = new Intl.DateTimeFormat(preferences.locale, { weekday: "narrow", timeZone: "UTC" });
  const range = new Intl.DateTimeFormat(preferences.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(dateOnly(start), dateOnly(end));
  const longDay = (date: string) => weekdayLabel(weekdayForDate(date), preferences.locale, "long");
  const when = (value: Date) => `${dayLabel.format(dateOnly(dayOf(value)))} · ${displayTime(value, user.timezone, preferences)}`;
  const kinds = ([["HABIT", "Hábitos"], ["TASK", "Tareas"], ["FIXED", "Citas y bloques fijos"]] as const).map(([key, label]) => ({ label, minutes: summary.kinds[key] })).filter(kind => kind.minutes > 0);
  const empty = !total.planned && !habitExpected && !checkIns.length && !missing;
  const extremes = dayExtremes(summary.days);
  const suggestions: string[] = [];
  if (missing) suggestions.push(t(`${missing} actividades quedaron sin espacio. Reduce la carga o amplía las franjas disponibles antes de volver a planificar.`));
  if (missedCount) suggestions.push(t(`${missedCount} bloques pasaron sin marcarse. Ciérralos como hechos u omitidos desde el chequeo de fin de día.`));
  if (extremes) suggestions.push(t(`Completaste más el ${longDay(extremes.best)} y menos el ${longDay(extremes.worst)}. Prueba a aligerar ese día.`));
  if (estimated && actual > estimated * 1.25) suggestions.push(t("Los bloques medidos tardaron más de lo previsto. Activa el ajuste de duraciones o amplía las estimaciones de esas tareas."));
  for (const row of rows) if (row.expected >= 3 && row.done / row.expected < .5) suggestions.push(t(`Revisa «${row.habit.title}»: prueba menos días o una duración menor para sostener la rutina.`));
  if (done.length && !measured.length) suggestions.push(t("Registra minutos reales al completar algunos bloques para comparar tus estimaciones."));
  if (closed && !checkIns.length) suggestions.push(t("Haz el chequeo de fin de día para anotar cómo fue cada jornada y resolver lo pendiente."));
  const stats = [
    { value: summary.rate === null ? "—" : `${summary.rate} %`, label: t("Cumplimiento"), detail: closed ? t(`${total.done} de ${closed} bloques cerrados`) : t("Aún no hay bloques cerrados"), extra: delta === null ? "" : t(`${delta > 0 ? "+" : ""}${delta} pts frente a la semana anterior`) },
    { value: minutesLabel(total.doneMinutes), label: t("Tiempo completado"), detail: t(`de ${minutesLabel(total.plannedMinutes)} planificados`), extra: "" },
    { value: habitExpected ? `${habitDone}/${habitExpected}` : "—", label: t("Hábitos cumplidos"), detail: habitExpected ? t(`${Math.round((habitDone / habitExpected) * 100)} % de lo previsto hasta hoy`) : t("Sin rutinas previstas"), extra: "" },
    { value: String(open.length), label: t("Por revisar o recuperar"), detail: t(`${missing} actividades sin espacio`), extra: total.upcoming ? t(`${total.upcoming} bloques por delante`) : "" },
  ];
  return <div className="space-y-6">
    <div><p className="eyebrow">{t("Un cierre para empezar mejor")}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("Revisión semanal")}</h1><p className="mt-3 text-sm text-muted">{range}{current ? ` · ${t("Semana en curso")}` : ""} · {user.timezone}</p></div>
    <nav aria-label={t("Semanas")} className="flex flex-wrap gap-2 text-sm"><Link className="btn" href={`/review?start=${addLocalDays(start, -7)}`}>{t("← Semana anterior")}</Link>{!current && <Link className="btn" href={`/review?start=${monday}`}>{t("Semana actual")}</Link>}{start < monday && <Link className="btn" href={`/review?start=${addLocalDays(start, 7)}`}>{t("Semana siguiente →")}</Link>}</nav>
    {empty ? <section className="rounded-3xl border border-dashed border-line-strong bg-card/50 px-6 py-12 text-center"><h2 className="text-xl">{t("Sin actividad registrada esta semana")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{t("La revisión se llena con los bloques que completas, omites o pospones, tus hábitos y los chequeos de fin de día.")}</p><Link href={current ? "/" : `/review?start=${monday}`} className="mt-5 inline-block text-sm text-sage underline underline-offset-4">{current ? t("Organizar mi día →") : t("Ver la semana en curso →")}</Link></section> : <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(stat => <div key={stat.label} className={card}><p className="text-xs font-semibold text-muted">{stat.label}</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums">{stat.value}</p><p className="mt-1 text-xs text-muted">{stat.detail}</p>{stat.extra && <p className="mt-1 text-xs font-medium text-sage">{stat.extra}</p>}</div>)}</div>
    <section className={card}><h2 className="text-2xl">{t("Día a día")}</h2><p className="mt-1 text-xs text-muted">{t("Bloques completados sobre los que ya pasaron, tiempo dedicado y tu balance del chequeo. Abre un día para verlo.")}</p>
      <ul className="mt-4 divide-y divide-line">{summary.days.map(day => { const dayClosed = day.done + day.open; const mood = moods.get(day.date); return <li key={day.date}><Link href={`/?date=${day.date}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-3 text-sm transition hover:bg-sunken sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,14rem)]">
        <span className={`font-semibold capitalize ${day.date === today ? "text-sage" : ""}`}>{dayLabel.format(dateOnly(day.date))}</span>
        {dayClosed ? <progress aria-label={t(`Cumplimiento del ${longDay(day.date)}`)} max={dayClosed} value={day.done} className="h-2 w-full accent-sage" /> : <span className="text-xs text-muted">{day.upcoming ? t(`${day.upcoming} bloques por delante`) : day.date > today ? t("Sin planificar todavía") : t("Sin bloques")}</span>}
        <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted sm:col-start-3 sm:justify-end">{dayClosed > 0 && <span>{day.done}/{dayClosed} · {minutesLabel(day.doneMinutes)}</span>}{dayClosed > 0 && day.upcoming > 0 && <span>{t(`${day.upcoming} bloques por delante`)}</span>}{mood && <span className={`rounded-full px-2 py-0.5 font-medium ${MOODS[mood.mood]?.tone ?? "bg-sunken"}`}>{t(MOODS[mood.mood]?.label ?? mood.mood)}</span>}</span>
      </Link></li>; })}</ul></section>
    {rows.length > 0 && <section className={card}><h2 className="text-2xl">{t("Hábitos")}</h2><p className="mt-1 text-xs text-muted">{t("Cumplimiento según la frecuencia actual. La racha cuenta días previstos o semanas completadas.")}</p>
      <ul className="mt-4 space-y-4">{rows.map(row => <li key={row.habit.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm"><span className="min-w-0 flex-1 basis-40"><span className="block truncate font-medium">{row.habit.title}</span><span className="text-xs text-muted">{row.done}/{row.expected}{row.weekly ? ` · ${t(`${row.habit.weeklyTarget} veces por semana · días flexibles`)}` : ""} · {row.streak} {row.weekly ? t("semanas") : t("días")} {t(" de racha")}</span></span>
        <span className="flex gap-1" aria-hidden="true">{row.marks.map(mark => <span key={mark.date} className={`grid size-7 place-items-center rounded-full text-[11px] font-semibold uppercase ${mark.state === "done" ? "bg-sage text-white" : mark.state === "missed" ? "border border-terracotta text-terracotta" : mark.state === "due" ? "border border-line-strong text-muted" : "bg-sunken text-muted/60"}`}>{mark.state === "done" ? "✓" : narrow.format(dateOnly(mark.date))}</span>)}</span></li>)}</ul>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true"><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-sage" />{t("Hecho")}</span><span><span className="mr-1.5 inline-block size-2.5 rounded-full border border-terracotta" />{t("Sin completar")}</span><span><span className="mr-1.5 inline-block size-2.5 rounded-full border border-line-strong" />{t("Previsto")}</span><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-sunken" />{t("No tocaba")}</span></p></section>}
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className={card}><h2 className="text-2xl">{t("En qué se fue el tiempo")}</h2>{kinds.length ? <ul className="mt-4 space-y-3 text-sm">{kinds.map(kind => <li key={kind.label}><span className="flex justify-between gap-3"><span>{t(kind.label)}</span><span className="tabular-nums text-muted">{minutesLabel(kind.minutes)}</span></span><progress aria-label={t(kind.label)} max={total.doneMinutes} value={kind.minutes} className="mt-1 h-2 w-full accent-sage" /></li>)}</ul> : <p className="mt-3 text-sm text-muted">{t("Todavía no hay bloques completados esta semana.")}</p>}</section>
      <section className={card}><h2 className="text-2xl">{t("Tiempo real frente a estimado")}</h2>{measured.length ? <><p className="mt-2 text-sm">{minutesLabel(actual)} {t("reales frente a")} {minutesLabel(estimated)} {t("estimados")} · {measured.length} {t(" de ")}{done.length} {t(" bloques completados con medición.")}</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{t("Tiempo real frente a estimado")}</caption><thead><tr className="text-xs text-muted"><th scope="col" className="py-2 pr-2 font-semibold">{t("Bloque")}</th><th scope="col" className="p-2 font-semibold">{t("Estimado")}</th><th scope="col" className="p-2 font-semibold">{t("Real")}</th><th scope="col" className="py-2 pl-2 font-semibold">{t("Diferencia")}</th></tr></thead><tbody>{measured.map(event => { const diff = event.actualMinutes! - estimateOf(event); return <tr key={event.id} className="border-t border-line tabular-nums"><td className="py-2 pr-2">{event.title}</td><td className="p-2">{estimateOf(event)} min</td><td className="p-2">{event.actualMinutes} min</td><td className={`py-2 pl-2 ${diff > 0 ? "text-terracotta" : diff < 0 ? "text-sage" : "text-muted"}`}>{diff > 0 ? "+" : ""}{diff} min</td></tr>; })}</tbody></table></div></> : <p className="mt-3 text-sm text-muted">{t("Ningún bloque completado tiene minutos reales. Anótalos en el chequeo de fin de día para saber si tus estimaciones se ajustan.")}</p>}</section>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className={card}><h2 className="text-2xl">{t("Para revisar o recuperar")}</h2>{open.length ? <ul className="mt-3 space-y-2 text-sm">{open.map(({ event, outcome }) => <li key={event.id}><Link href={`/?date=${dayOf(event.startsAt)}`} className="flex flex-wrap items-baseline justify-between gap-x-3 hover:underline"><span>{event.title}</span><span className="text-xs text-muted"><span className="capitalize">{when(event.startsAt)}</span> · {t(OPEN_LABELS[outcome!])}</span></Link></li>)}</ul> : <p className="mt-3 text-sm text-muted">{t("Nada pendiente de esta semana.")}</p>}</section>
      <section className={card}><h2 className="text-2xl">{t("Lo que hiciste")}</h2>{done.length ? <details className="mt-2 text-sm" open={done.length <= 8}><summary className="font-medium text-sage">{t(`${done.length} bloques completados`)}</summary><ul className="mt-2 space-y-2">{done.map(event => <li key={event.id}><Link href={`/?date=${dayOf(event.startsAt)}`} className="flex flex-wrap items-baseline justify-between gap-x-3 hover:underline"><span>{event.title}</span><span className="text-xs capitalize text-muted">{when(event.startsAt)}</span></Link></li>)}</ul></details> : <p className="mt-3 text-sm text-muted">{t("Sin bloques en esta sección.")}</p>}</section>
    </div>
    {notes.length > 0 && <section className={card}><h2 className="text-2xl">{t("Notas de tus chequeos")}</h2><ul className="mt-3 space-y-3 text-sm">{notes.map(value => <li key={value.id}><span className="text-xs font-semibold capitalize text-muted">{dayLabel.format(value.date)}</span><p className="mt-0.5 whitespace-pre-line">{value.note}</p></li>)}</ul></section>}
    <section className="rounded-2xl bg-sage/10 p-5"><h2 className="text-2xl">{t("Ajustes sugeridos")}</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{suggestions.length ? suggestions.map(suggestion => <li key={suggestion}>{suggestion}</li>) : <li>{t("Tu carga y tus mediciones están equilibradas esta semana.")}</li>}</ul><div className="mt-4 flex flex-wrap gap-4 text-sm text-sage"><Link href="/settings">{t("Ajustar preferencias →")}</Link><Link href="/habits">{t("Revisar hábitos →")}</Link><Link href="/inbox">{t("Ver estimaciones sugeridas →")}</Link>{start <= today && lastDay >= addLocalDays(today, -28) && <Link href={`/check-in?date=${lastDay}`}>{t("Hacer el chequeo del día →")}</Link>}</div></section>
    </>}
  </div>;
}
