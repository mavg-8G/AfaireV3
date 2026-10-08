import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { addLocalDays, calendarDayBounds, dateOnly, weekdayForDate, ymdInZone } from "@/lib/time";
import { habitStats } from "@/lib/insights";
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone); const params = await searchParams;
  const monday = addLocalDays(today, -((weekdayForDate(today) + 6) % 7));
  const parsed = DateSchema.safeParse(params.start ?? addLocalDays(monday, -7)); if (!parsed.success) notFound();
  const start = parsed.data; const end = addLocalDays(start, 6);
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
  const hours = (minutes: number) => (minutes / 60).toLocaleString("es", { maximumFractionDigits: 1 });
  const rows = habits.map(h => ({ habit: h, ...habitStats(h.daysOfWeek, start, end < today ? end : today, ymdInZone(h.createdAt, user.timezone), new Set(completed.filter(c => c.habitId === h.id).map(c => c.date.toISOString().slice(0, 10))), today) }));
  const suggestions: string[] = [];
  if (missing) suggestions.push(`${missing} actividades quedaron sin espacio. Reduce la carga o amplía las franjas disponibles antes de volver a planificar.`);
  if (estimated && actual > estimated * 1.25) suggestions.push("Los bloques medidos tardaron más de lo previsto. Activa el ajuste de duraciones o amplía las estimaciones de esas tareas.");
  for (const row of rows) if (row.expected >= 3 && row.done / row.expected < .5) suggestions.push(`Revisa «${row.habit.title}»: prueba menos días o una duración menor para sostener la rutina.`);
  if (!measured.length) suggestions.push("Registra minutos reales al completar algunos bloques para comparar tus estimaciones.");
  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-widest text-sage">Un cierre para empezar mejor</p><h1 className="mt-3 text-4xl">Revisión semanal</h1><p className="mt-3 text-sm text-muted">{start} — {end} · {user.timezone}</p></div><nav className="flex flex-wrap gap-3 text-sm"><Link href={`/review?start=${addLocalDays(start, -7)}`}>← Semana anterior</Link><Link href={`/review?start=${monday}`}>Semana actual</Link><Link href={`/review?start=${addLocalDays(start, 7)}`}>Semana siguiente →</Link></nav>
    <div className="grid gap-3 sm:grid-cols-3">{[[done.length, "bloques completados"], [postponed.length, "omitidos o pendientes de recuperar"], [missing, "actividades sin espacio"]].map(([n, label]) => <div key={label} className="rounded-2xl border border-line bg-card p-5"><p className="text-3xl">{n}</p><p className="text-xs text-muted">{label}</p></div>)}</div>
    <section className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">Tiempo real frente a estimado</h2><p className="mt-2 text-sm">{hours(actual)} h reales / {hours(estimated)} h estimadas · {measured.length} de {done.length} bloques completados con medición.</p><p className="mt-1 text-xs text-muted">La comparación usa solo bloques con tiempo real registrado.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Tarea</th><th className="p-2">Estimado</th><th className="p-2">Real</th></tr></thead><tbody>{done.filter(e => e.taskId).map(e => <tr key={e.id} className="border-t border-line"><td className="p-2">{e.title}</td><td className="p-2">{e.estimatedMinutes ?? Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000)} min</td><td className="p-2">{e.actualMinutes === null ? "Sin medir" : `${e.actualMinutes} min`}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">Hábitos</h2><p className="mt-1 text-xs text-muted">Cumplimiento según los días actuales de cada rutina. La racha cuenta días previstos hasta hoy.</p><ul className="mt-4 space-y-3">{rows.map(row => <li key={row.habit.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{row.habit.title}</span><span>{row.done}/{row.expected} · {row.streak} días de racha</span></li>)}</ul></section>
    <div className="grid gap-5 md:grid-cols-2">{[["Lo que hiciste", done], ["Para revisar o recuperar", postponed]].map(([label, items]) => <section key={label as string} className="rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{label as string}</h2><ul className="mt-3 space-y-2 text-sm">{(items as typeof events).map(e => <li key={e.id}><Link href={`/?date=${ymdInZone(e.startsAt, user.timezone)}`}>{e.title} · {ymdInZone(e.startsAt, user.timezone)}</Link></li>)}</ul>{!(items as typeof events).length && <p className="mt-3 text-sm text-muted">Sin bloques en esta sección.</p>}</section>)}</div>
    <section className="rounded-2xl bg-sage/10 p-5"><h2 className="text-2xl">Ajustes sugeridos</h2><ul className="mt-3 space-y-2 text-sm">{suggestions.length ? suggestions.map(s => <li key={s}>{s}</li>) : <li>Tu carga y tus mediciones están equilibradas esta semana.</li>}</ul><div className="mt-4 flex gap-4 text-sm text-sage"><Link href="/settings">Ajustar preferencias →</Link><Link href="/habits">Revisar hábitos →</Link></div></section>
  </div>;
}
