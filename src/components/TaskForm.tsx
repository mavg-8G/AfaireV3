"use client";
import { useState } from "react";
import type { Task } from "@prisma/client";
import { createTask, updateTask } from "@/app/actions/tasks";
import { WINDOW_LABELS } from "@/lib/definitions";
export function TaskForm({ task }: { task?: Task }) {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <form className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setError(""); setMessage("");
    try { const result = task ? await updateTask(task.id, new FormData(form)) : await createTask(new FormData(form)); if (result.error) setError(result.error); else { setMessage("Tarea guardada."); if (!task) form.reset(); } }
    catch { setError("No se pudo guardar."); } finally { setPending(false); }
  }}>
    <h2 className="text-xl">{task ? "Editar tarea" : "Sácalo de tu cabeza"}</h2>
    <label className="text-sm">Qué necesitas hacer<input name="title" required maxLength={160} defaultValue={task?.title} placeholder="Ej. preparar la propuesta" className="field" /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">Minutos<input name="durationMinutes" required type="number" min={5} max={480} defaultValue={task?.durationMinutes ?? 30} className="field" /></label><label className="text-sm">Prioridad<select name="priority" defaultValue={task?.priority ?? 2} className="field"><option value="1">Alta</option><option value="2">Media</option><option value="3">Baja</option></select></label></div>
    <label className="text-sm">Momento preferido<select name="preferredWindow" defaultValue={task?.preferredWindow ?? "ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="text-sm">Energía<select name="energy" defaultValue={task?.energy ?? "LIGHT"} className="field"><option value="LIGHT">Ligera</option><option value="DEEP">Profunda · priorizar mi franja de foco</option></select></label><label className="text-sm">Fecha límite · opcional<input name="dueDate" type="date" defaultValue={task?.dueDate?.toISOString().slice(0, 10)} className="field" /></label>
    {error && <p role="alert" className="text-sm text-terracotta">{error}</p>}{message && <p role="status" className="text-sm text-sage">{message}</p>}
    <button disabled={pending} className="rounded-full bg-sage py-2.5 text-white">{pending ? "Guardando…" : task ? "Guardar cambios" : "Guardar en la bandeja"}</button>
  </form>;
}
