"use client";
import { useState } from "react";
import type { Habit } from "@prisma/client";
import { createHabit, updateHabit } from "@/app/actions/habits";
import { WEEKDAY_LABELS, WINDOW_LABELS } from "@/lib/definitions";
export function HabitForm({ habit }: { habit?: Habit }) {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <form className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setError(""); setMessage("");
    try { const result = habit ? await updateHabit(habit.id, new FormData(form)) : await createHabit(new FormData(form)); if (result.error) setError(result.error); else { setMessage("Hábito guardado. Se aplicará al próximo plan."); if (!habit) form.reset(); } }
    catch { setError("No se pudo guardar."); } finally { setPending(false); }
  }}>
    <h2 className="text-xl">{habit ? "Editar hábito" : "Una rutina nueva"}</h2>
    <label className="text-sm">Qué quieres hacer<input name="title" required maxLength={160} defaultValue={habit?.title} placeholder="Ej. salir a caminar" className="field" /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">Minutos<input name="durationMinutes" type="number" required min={5} max={480} defaultValue={habit?.durationMinutes ?? 30} className="field" /></label><label className="text-sm">Prioridad<select name="priority" defaultValue={habit?.priority ?? 2} className="field"><option value="1">Alta</option><option value="2">Media</option><option value="3">Baja</option></select></label></div>
    <label className="text-sm">Momento preferido<select name="preferredWindow" defaultValue={habit?.preferredWindow ?? "ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <fieldset className="text-sm"><legend>Días de la semana</legend><div className="mt-2 flex flex-wrap gap-2">{WEEKDAY_LABELS.map((label, index) => <label key={label} className="flex items-center gap-1 rounded-lg border border-line px-2 py-2"><input name="daysOfWeek" type="checkbox" value={index} defaultChecked={habit ? habit.daysOfWeek.includes(index) : true} />{label}</label>)}</div></fieldset>
    <label className="flex items-center gap-2 text-sm"><input name="required" type="checkbox" defaultChecked={habit?.required} />Es esencial para mi día</label>
    {error && <p role="alert" className="text-sm text-terracotta">{error}</p>}{message && <p role="status" className="text-sm text-sage">{message}</p>}
    <button disabled={pending} className="rounded-full bg-sage py-2.5 text-white">{pending ? "Guardando…" : habit ? "Guardar cambios" : "Añadir hábito"}</button>
  </form>;
}
