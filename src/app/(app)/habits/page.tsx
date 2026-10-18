import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import { habitStats } from "@/lib/insights";
import { addLocalDays, startOfLocalWeek, ymdInZone } from "@/lib/time";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { HabitForm } from "@/components/HabitForm";
import { ActionButton } from "@/components/ActionButton";
import { toggleHabit, deleteHabit } from "@/app/actions/habits";
import { PRIORITY_LABELS, WINDOW_LABELS, WEEKDAY_LABELS } from "@/lib/definitions";
export default async function HabitsPage() {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const habits = await prisma.habit.findMany({ where: { userId: user.id, archived: false }, orderBy: [{ required: "desc" }, { priority: "asc" }, { createdAt: "asc" }] });
  const today = ymdInZone(new Date(), user.timezone); const start = startOfLocalWeek(today, user.weekStartsOn);
  const completed = await prisma.habitOccurrence.findMany({ where: { userId: user.id, status: "DONE" }, select: { habitId: true, date: true, event: { select: { minimal: true } } } });
  // Weekly goals include future opportunities; this is progress toward a goal, not an adherence rate.
  const stats = new Map(habits.map(h => { const done = new Set(completed.filter(c => c.habitId === h.id).map(c => c.date.toISOString().slice(0, 10)));
    const weeks = Array.from({ length: 8 }, (_, i) => { const from = addLocalDays(start, -7 * i); return habitStats(h.daysOfWeek, from, addLocalDays(from, 6), ymdInZone(h.createdAt, user.timezone), done, today, h.frequencyMode === "WEEKLY" ? h.weeklyTarget : undefined, user.weekStartsOn); });
    const left = Math.max(0, weeks[0].expected - weeks[0].done);
    return [h.id, { weeks, left, minimal: completed.filter(c => c.habitId === h.id && c.event?.minimal && c.date.toISOString().slice(0, 10) >= start && c.date.toISOString().slice(0, 10) <= today).length }]; }));
  const cell = (s: { done: number; expected: number }) => !s.expected ? "bg-sunken" : s.done >= s.expected ? "bg-sage" : s.done * 2 >= s.expected ? "bg-sage/60" : s.done ? "bg-sage/30" : "border border-line-strong";
  const categories = await prisma.categoryBudget.findMany({where:{userId:user.id},orderBy:{name:"asc"}});
  return <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]"><section className="space-y-5"><div><p className="eyebrow">{t("Pequeñas cosas, todos los días")}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("Tus hábitos")}</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{t("Rutinas sin una hora rígida. Al organizar el día, Afaire encuentra un espacio y prioriza las esenciales.")}</p></div>
    {!habits.length && <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">{t("Empieza con algo que quieras cuidar: caminar, comer con calma o leer unos minutos.")}</p>}
    {habits.map(habit => <article key={habit.id} className={`rounded-2xl border border-line bg-card p-5 `}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-sage">{habit.required ? t("Esencial · ") : ""}{habit.active ? t("Activo") : t("Pausado")}</p><h2 className="mt-2 text-2xl">{habit.title}</h2><p className="mt-2 text-xs leading-relaxed text-muted">{habit.durationMinutes} {t(" min · prioridad ")}{t(PRIORITY_LABELS[habit.priority])} · {t(WINDOW_LABELS[habit.preferredWindow])}<br />{habit.frequencyMode === "WEEKLY" ? t(`${habit.weeklyTarget} veces por semana · días flexibles`) : habit.daysOfWeek.map(day => t(WEEKDAY_LABELS[day])).join(" · ")}</p></div><div className="flex gap-2"><ActionButton action={toggleHabit.bind(null, habit.id)}>{habit.active ? t("Pausar") : t("Activar")}</ActionButton><ActionButton action={deleteHabit.bind(null, habit.id)} confirm={t("¿Eliminar este hábito? Se conservarán los bloques históricos.")} className="text-terracotta">{t("Eliminar")}</ActionButton></div></div>{(() => { const s = stats.get(habit.id)!, week = s.weeks[0], left = s.left; return <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-sage"><strong>{week.done} {t("de")} {week.expected}</strong>{t(" del objetivo semanal")}{s.minimal > 0 && <>{" · "}{s.minimal}{t(" en versión mínima")}</>}{week.expected > 0 && week.done >= week.expected ? t(" · meta cumplida ✓") : left > 0 && <>{t(" · te faltan ")}{left}</>}</p><ol aria-label={t("Últimas 8 semanas")} className="flex gap-1">{[...s.weeks].reverse().map((w, i) => <li key={i} title={`${w.done}/${w.expected}`} className={`size-4 rounded ${cell(w)}`}><span className="sr-only">{w.done}/{w.expected}</span></li>)}</ol></div>; })()}<details className="mt-4"><summary className="cursor-pointer text-sm text-muted">{t("Editar rutina")}</summary><div className="mt-3"><HabitForm habit={habit} categories={categories} /></div></details></article>)}
  </section><HabitForm categories={categories} /></div>;
}
