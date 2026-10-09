import { CategoryProgress } from "@/components/CategoryProgress";
import { ProcrastinationPrompt } from "@/components/ProcrastinationPrompt";
import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import { taskDurationSuggestions } from "@/lib/duration-suggestions";
import { CapacityWarnings } from "@/components/CapacityWarnings";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { FlexibleTasks } from "@/components/FlexibleTasks";
import { dateOnly } from "@/lib/time";
import { TaskForm } from "@/components/TaskForm";
import { ActionButton } from "@/components/ActionButton";
import { completeTask, deleteTask, returnTaskToInbox, acceptDurationSuggestion } from "@/app/actions/tasks";
import { PRIORITY_LABELS, WINDOW_LABELS } from "@/lib/definitions";
import { ymdInZone } from "@/lib/time";
export default async function InboxPage() {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone);
  const tasks = await prisma.task.findMany({ where: { userId: user.id, archived: false, OR: [{ availableFrom: null }, { availableFrom: { lte: dateOnly(today) } }, { status: "SCHEDULED" }] }, orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }], include: { events: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: { startsAt: "asc" }, take: 1 } } });
  const categories = await prisma.categoryBudget.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  const series = await prisma.taskSeries.findMany({ where: { userId: user.id, active: true }, orderBy: { title: "asc" } });
  const suggestions = new Map((await taskDurationSuggestions(prisma, user.id)).map(s => [s.taskId, s]));
  return <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]"><section className="space-y-5"><div><p className="text-xs uppercase tracking-widest text-sage">{t("Un lugar para tus pendientes")}</p><h1 className="mt-3 text-4xl">{t("Bandeja")}</h1><p className="mt-3 text-sm leading-relaxed text-muted">{t("Guarda lo que necesitas hacer. El plan buscará un hueco sin mover tus citas.")}</p></div>
    <CapacityWarnings userId={user.id} day={today} /><CategoryProgress userId={user.id} day={today} />
    {!tasks.length && <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">{t("Todo despejado. Captura una tarea cuando aparezca.")}</p>}
    {tasks.map(task => <article key={task.id} className={`rounded-2xl border border-line bg-card p-5 ${task.status === "DONE" ? "opacity-65" : ""}`}><p className="text-xs text-muted">{task.status === "INBOX" ? t("Sin hora") : task.status === "SCHEDULED" ? t("Programada") : task.delegatedTo ? t(`Delegada a ${task.delegatedTo}`) : task.status === "CANCELLED" ? t("Retirada") : t("Completada")} · {task.durationMinutes} {t(" min · prioridad ")}{PRIORITY_LABELS[task.priority]} · {WINDOW_LABELS[task.preferredWindow]} · {task.energy === "DEEP" ? t("Profunda") : t("Ligera")}</p><h2 className={`mt-2 text-2xl ${task.status === "DONE" ? "line-through" : ""}`}>{task.title}</h2>
      {suggestions.has(task.id) && <div className="mt-3 rounded-xl bg-sage/10 p-3 text-sm"><p>{t("Duración sugerida: ")}{suggestions.get(task.id)!.suggested} {t(" min en lugar de ")}{task.durationMinutes} min.</p><p className="mt-1 text-xs text-muted">{t("Mediana real de ")}{suggestions.get(task.id)!.median} {t(" min en ")}{suggestions.get(task.id)!.samples} {t(" bloques completados con el mismo título. Ajuste limitado al 25 %; se usará en próximos planes.")}</p><div className="mt-2"><ActionButton action={acceptDurationSuggestion.bind(null, task.id)}>{t("Aplicar estimación sugerida")}</ActionButton></div></div>}
      {task.seriesId && <p className="mt-2 text-xs text-sage">{t("Repetición flexible · ventana desde ")}{task.availableFrom?.toISOString().slice(0,10)}</p>}
      {task.dueDate && <p className={`mt-2 text-xs ${task.dueDate.toISOString().slice(0, 10) < today && task.status !== "DONE" ? "text-terracotta" : "text-muted"}`}>{t("Fecha límite: ")}{task.dueDate.toISOString().slice(0, 10)}</p>}
      {task.events[0] && <p className="mt-2 text-xs text-sage">{t("En agenda el ")}{ymdInZone(task.events[0].startsAt, user.timezone)}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{task.status !== "DONE" && <ActionButton action={completeTask.bind(null, task.id)}>{t("Completar ✓")}</ActionButton>}{(task.status === "SCHEDULED" || Boolean(task.delegatedTo)) && <ActionButton action={returnTaskToInbox.bind(null, task.id)}>{t("Desagendar")}</ActionButton>}<ActionButton action={deleteTask.bind(null, task.id)} confirm={t("¿Eliminar esta tarea y retirar sus bloques pendientes?")} className="text-terracotta">{t("Eliminar")}</ActionButton></div>
      {task.status === "INBOX" && <details className="mt-4"><summary className="cursor-pointer text-sm text-muted">{t("Editar tarea")}</summary><div className="mt-3"><TaskForm task={task} categories={categories} /></div></details>}
      {task.categoryId && <p className="mt-2 text-xs text-sage">{categories.find(c=>c.id===task.categoryId)?.name}</p>}
      <ProcrastinationPrompt task={task} />
    </article>)}
  </section><aside className="space-y-5"><TaskForm categories={categories} today={today} timezone={user.timezone} /><FlexibleTasks today={today} series={series} /></aside></div>;
}
