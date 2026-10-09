"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import type { Task } from "@prisma/client";
import { createTask, updateTask } from "@/app/actions/tasks";
import { WINDOW_LABELS } from "@/lib/definitions";
export function TaskForm({ task }: { task?: Task }) {
  const { t } = useI18n();
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <form aria-busy={pending} className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setError(""); setMessage("");
    try { const result = task ? await updateTask(task.id, new FormData(form)) : await createTask(new FormData(form)); if (result.error) setError(result.error); else { setMessage(t("Tarea guardada.")); if (!task) form.reset(); } }
    catch { setError(t("No se pudo guardar.")); } finally { setPending(false); }
  }}>
    <h2 className="text-xl">{task ? t("Editar tarea") : t("Sácalo de tu cabeza")}</h2>
    <label className="text-sm">{t("Qué necesitas hacer")}<input name="title" required maxLength={160} defaultValue={task?.title} placeholder="Ej. preparar la propuesta" className="field" /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{t("Minutos")}<input name="durationMinutes" required type="number" min={5} max={480} defaultValue={task?.durationMinutes ?? 30} className="field" /></label><label className="text-sm">{t("Prioridad")}<select name="priority" defaultValue={task?.priority ?? 2} className="field"><option value="1">{t("Alta")}</option><option value="2">{t("Media")}</option><option value="3">{t("Baja")}</option></select></label></div>
    <label className="text-sm">{t("Momento preferido")}<select name="preferredWindow" defaultValue={task?.preferredWindow ?? "ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    <label className="text-sm">{t("Energía")}<select name="energy" defaultValue={task?.energy ?? "LIGHT"} className="field"><option value="LIGHT">{t("Ligera")}</option><option value="DEEP">{t("Profunda · priorizar mi franja de foco")}</option></select></label><label className="text-sm">{t("Fecha límite")}{task?.seriesId ? t(" · fin de la ventana") : " · opcional"}<input name="dueDate" type="date" required={Boolean(task?.seriesId)} min={task?.availableFrom?.toISOString().slice(0,10)} defaultValue={task?.dueDate?.toISOString().slice(0, 10)} className="field" /></label>
    {error && <p role="alert" className="text-sm text-terracotta">{t(error)}</p>}{message && <p role="status" className="text-sm text-sage">{t(message)}</p>}
    <button disabled={pending} className="rounded-full bg-sage py-2.5 text-white">{pending ? t("Guardando…") : task ? t("Guardar cambios") : t("Guardar en la bandeja")}</button>
  </form>;
}
