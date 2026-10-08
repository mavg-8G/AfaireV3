import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { TaskForm } from "@/components/TaskForm";
import { ActionButton } from "@/components/ActionButton";
import { completeTask, deleteTask, returnTaskToInbox } from "@/app/actions/tasks";
import { PRIORITY_LABELS, WINDOW_LABELS } from "@/lib/definitions";
import { ymdInZone } from "@/lib/time";
export default async function InboxPage() {
  const user = await requireUser(); const today = ymdInZone(new Date(), user.timezone);
  const tasks = await prisma.task.findMany({ where: { userId: user.id, archived: false }, orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }], include: { events: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: { startsAt: "asc" }, take: 1 } } });
  return <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]"><section className="space-y-5"><div><p className="text-xs uppercase tracking-widest text-sage">Un lugar para tus pendientes</p><h1 className="mt-3 text-4xl">Bandeja</h1><p className="mt-3 text-sm leading-relaxed text-muted">Guarda lo que necesitas hacer. El plan buscará un hueco sin mover tus citas.</p></div>
    {!tasks.length && <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">Todo despejado. Captura una tarea cuando aparezca.</p>}
    {tasks.map(task => <article key={task.id} className={`rounded-2xl border border-line bg-card p-5 ${task.status === "DONE" ? "opacity-65" : ""}`}><p className="text-xs text-muted">{task.status === "INBOX" ? "Sin hora" : task.status === "SCHEDULED" ? "Programada" : "Completada"} · {task.durationMinutes} min · prioridad {PRIORITY_LABELS[task.priority]} · {WINDOW_LABELS[task.preferredWindow]}</p><h2 className={`mt-2 text-2xl ${task.status === "DONE" ? "line-through" : ""}`}>{task.title}</h2>
      {task.dueDate && <p className={`mt-2 text-xs ${task.dueDate.toISOString().slice(0, 10) < today && task.status !== "DONE" ? "text-terracotta" : "text-muted"}`}>Fecha límite: {task.dueDate.toISOString().slice(0, 10)}</p>}
      {task.events[0] && <p className="mt-2 text-xs text-sage">En agenda el {ymdInZone(task.events[0].startsAt, user.timezone)}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{task.status !== "DONE" && <ActionButton action={completeTask.bind(null, task.id)}>Completar ✓</ActionButton>}{task.status === "SCHEDULED" && <ActionButton action={returnTaskToInbox.bind(null, task.id)}>Desagendar</ActionButton>}<ActionButton action={deleteTask.bind(null, task.id)} confirm="¿Eliminar esta tarea y retirar sus bloques pendientes?" className="text-terracotta">Eliminar</ActionButton></div>
      {task.status === "INBOX" && <details className="mt-4"><summary className="cursor-pointer text-sm text-muted">Editar tarea</summary><div className="mt-3"><TaskForm task={task} /></div></details>}
    </article>)}
  </section><TaskForm /></div>;
}
