import { habitStats } from "@/lib/insights";
import { addLocalDays, weekdayForDate, ymdInZone } from "@/lib/time";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { HabitForm } from "@/components/HabitForm";
import { ActionButton } from "@/components/ActionButton";
import { toggleHabit, deleteHabit } from "@/app/actions/habits";
import { PRIORITY_LABELS, WINDOW_LABELS, WEEKDAY_LABELS } from "@/lib/definitions";
export default async function HabitsPage() {
  const user = await requireUser(); const habits = await prisma.habit.findMany({ where: { userId: user.id, archived: false }, orderBy: [{ required: "desc" }, { priority: "asc" }, { createdAt: "asc" }] });
  const today = ymdInZone(new Date(), user.timezone); const start = addLocalDays(today, -((weekdayForDate(today) + 6) % 7));
  const completed = await prisma.habitOccurrence.findMany({ where: { userId: user.id, status: "DONE" }, select: { habitId: true, date: true } });
  const stats = new Map(habits.map(h => [h.id, habitStats(h.daysOfWeek, start, today, ymdInZone(h.createdAt, user.timezone), new Set(completed.filter(c => c.habitId === h.id).map(c => c.date.toISOString().slice(0, 10))), today)]));
  return <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]"><section className="space-y-5"><div><p className="text-xs uppercase tracking-widest text-sage">Pequeñas cosas, todos los días</p><h1 className="mt-3 text-4xl">Tus hábitos</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">Rutinas sin una hora rígida. Al organizar el día, Afaire encuentra un espacio y prioriza las esenciales.</p></div>
    {!habits.length && <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">Empieza con algo que quieras cuidar: caminar, comer con calma o leer unos minutos.</p>}
    {habits.map(habit => <article key={habit.id} className={`rounded-2xl border border-line bg-card p-5 ${!habit.active ? "opacity-65" : ""}`}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-sage">{habit.required ? "Esencial · " : ""}{habit.active ? "Activo" : "Pausado"}</p><h2 className="mt-2 text-2xl">{habit.title}</h2><p className="mt-2 text-xs leading-relaxed text-muted">{habit.durationMinutes} min · prioridad {PRIORITY_LABELS[habit.priority]} · {WINDOW_LABELS[habit.preferredWindow]}<br />{habit.daysOfWeek.map(day => WEEKDAY_LABELS[day]).join(" · ")}</p></div><div className="flex gap-2"><ActionButton action={toggleHabit.bind(null, habit.id)}>{habit.active ? "Pausar" : "Activar"}</ActionButton><ActionButton action={deleteHabit.bind(null, habit.id)} confirm="¿Eliminar este hábito? Se conservarán los bloques históricos." className="text-terracotta">Eliminar</ActionButton></div></div><p className="mt-3 text-sm text-sage">Racha: {stats.get(habit.id)?.streak} días previstos · Esta semana: {stats.get(habit.id)?.done}/{stats.get(habit.id)?.expected} hasta hoy</p><details className="mt-4"><summary className="cursor-pointer text-sm text-muted">Editar rutina</summary><div className="mt-3"><HabitForm habit={habit} /></div></details></article>)}
  </section><HabitForm /></div>;
}
