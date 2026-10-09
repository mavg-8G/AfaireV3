import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { startOfLocalWeek, addLocalDays, calendarDayBounds, dateOnly, ymdInZone } from "@/lib/time";
import { habitStats } from "@/lib/insights";
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone); const params = await searchParams;
  const monday = startOfLocalWeek(today, user.weekStartsOn);
  const parsed = DateSchema.safeParse(params.start ?? addLocalDays(monday, -7)); if (!parsed.success) notFound();
  const start = startOfLocalWeek(parsed.data, user.weekStartsOn); const end = addLocalDays(start, 6);
  const bounds = { start: calendarDayBounds(start, user.timezone).start, end: calendarDayBounds(end, user.timezone).end };
  const [events, habits, completed, plans] = await Promise.all([
    prisma.event.findMany({ where: { userId: user.id, startsAt: { gte: bounds.start, lt: bounds.end } }, orderBy: { startsAt: "asc" }, include: { task: true } }),
    prisma.habit.findMany({ where: { userId: user.id, archived: false } }),
    prisma.habitOccurrence.findMany({ where: { userId: user.id, status: "DONE" }, select: { habitId: true, date: true } }),
    prisma.dayPlan.findMany({ where: { userId: user.id, date: { gte: dateOnly(start), lte: dateOnly(end) } } }),
  ]);
  const done = events.filter(e => e.status === "DONE");
  const postponed = events.filter(e => e.status === "SKIPPED" || (e.status === "CANCELLED" && e.taskId) || (e.status === "PENDING" && e.endsAt < new Date()));
  const measured = done.filter(e => e.actualMinutes !== null);
  const actual = measured.reduce((sum, e) => sum + e.actualMinutes!, 0);
  const estimated = measured.reduce((sum, e) => sum + (e.estimatedMinutes ?? (e.endsAt.getTime() - e.startsAt.getTime()) / 60_000), 0);
  const missing = plans.reduce((sum, p) => sum + p.skipped.length, 0);
  const hours = (minutes: number) => (minutes / 60).toLocaleString(preferences.locale, { maximumFractionDigits: 1 });
  const rows = habits.map(h => ({ habit: h, ...habitStats(h.daysOfWeek, start, end < today ? end : today, ymdInZone(h.createdAt, user.timezone), new Set(completed.filter(c => c.habitId === h.id).map(c => c.date.toISOString().slice(0, 10))), today, h.frequencyMode === "WEEKLY" ? h.weeklyTarget : undefined, user.weekStartsOn) }));
  const suggestions: string[] = [];
  if (missing) suggestions.push(t(`${missing} actividades quedaron sin espacio. Reduce la carga o amplía las franjas disponibles antes de volver a planificar.`));
  if (estimated && actual > estimated * 1.25) suggestions.push(t("Los bloques medidos tardaron más de lo previsto. Activa el ajuste de duraciones o amplía las estimaciones de esas tareas."));
  for (const row of rows) if (row.expected >= 3 && row.done / row.expected < .5) suggestions.push(t(`Revisa «${row.habit.title}»: prueba menos días o una duración menor para sostener la rutina.`));
  if (!measured.length) suggestions.push(t("Registra minutos reales al completar algunos bloques para comparar tus estimaciones."));
  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-widest text-sage">{t("Un cierre para empezar mejor")}</p><h1 className="mt-3 text-4xl">{t("Revisión semanal")}</h1><p className="mt-3 text-sm text-muted">{start} — {end} · {user.timezone}</p></div><nav className="flex flex-wrap gap-3 text-sm"><Link href={`/review?start=${addLocalDays(start, -7)}`}>{t("← Semana anterior")}</Link><Link href={`/review?start=${monday}`}>{t("Semana actual")}</Link><Link href={`/review?start=${addLocalDays(start, 7)}`}>{t("Semana siguiente →")}</Link></nav>
    <div className="grid gap-3 sm:grid-cols-3">{[[done.length, "bloques completados"], [postponed.length, t("omitidos o pendientes de recuperar")], [missing, t("actividades sin espacio")]].map(([n, label]) => <div key={label} className="rounded-2xl border border-line bg-card p-5"><p className="text-3xl">{n}</p><p className="text-xs text-muted">{t(String(label))}</p></div>)}</div>
    <section className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{t("Tiempo real frente a estimado")}</h2><p className="mt-2 text-sm">{hours(actual)} {t(" h reales / ")}{hours(estimated)} {t(" h estimadas · ")}{measured.length} {t(" de ")}{done.length} {t(" bloques completados con medición.")}</p><p className="mt-1 text-xs text-muted">{t("La comparación usa solo bloques con tiempo real registrado.")}</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{t("Tiempo real frente a estimado")}</caption><thead><tr><th scope="col" className="p-2">{t("Tarea")}</th><th scope="col" className="p-2">{t("Estimado")}</th><th scope="col" className="p-2">{t("Real")}</th></tr></thead><tbody>{done.filter(e => e.taskId).map(e => <tr key={e.id} className="border-t border-line"><td className="p-2">{e.title}</td><td className="p-2">{e.estimatedMinutes ?? Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000)} min</td><td className="p-2">{e.actualMinutes === null ? t("Sin medir") : `${e.actualMinutes} min`}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{t("Hábitos")}</h2><p className="mt-1 text-xs text-muted">{t("Cumplimiento según la frecuencia actual. La racha cuenta días previstos o semanas completadas.")}</p><ul className="mt-4 space-y-3">{rows.map(row => <li key={row.habit.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{row.habit.title}</span><span>{row.done}/{row.expected} · {row.streak} {row.habit.frequencyMode === "WEEKLY" ? "semanas" : t("días")} {t(" de racha")}</span></li>)}</ul></section>
    <div className="grid gap-5 md:grid-cols-2">{[[t("Lo que hiciste"), done], [t("Para revisar o recuperar"), postponed]].map(([label, items]) => <section key={t(label as string)} className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{label as string}</h2><ul className="mt-3 space-y-2 text-sm">{(items as typeof events).map(e => <li key={e.id}><Link href={`/?date=${ymdInZone(e.startsAt, user.timezone)}`}>{e.title} · {ymdInZone(e.startsAt, user.timezone)}</Link></li>)}</ul>{!(items as typeof events).length && <p className="mt-3 text-sm text-muted">{t("Sin bloques en esta sección.")}</p>}</section>)}</div>
    <section className="rounded-2xl bg-sage/10 p-5"><h2 className="text-2xl">{t("Ajustes sugeridos")}</h2><ul className="mt-3 space-y-2 text-sm">{suggestions.length ? suggestions.map(s => <li key={s}>{t(s)}</li>) : <li>{t("Tu carga y tus mediciones están equilibradas esta semana.")}</li>}</ul><div className="mt-4 flex flex-wrap gap-4 text-sm text-sage"><Link href="/settings">{t("Ajustar preferencias →")}</Link><Link href="/habits">{t("Revisar hábitos →")}</Link><Link href="/inbox">{t("Ver estimaciones sugeridas →")}</Link></div></section>
  </div>;
}
