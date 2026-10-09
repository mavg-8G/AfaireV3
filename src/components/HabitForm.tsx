"use client";
import { orderedWeekdays, weekdayLabel } from "@/lib/locale";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import type { Habit, CategoryBudget } from "@prisma/client";
import { createHabit, updateHabit } from "@/app/actions/habits";
import { WINDOW_LABELS } from "@/lib/definitions";
export function HabitForm({ habit, categories = [] }: { habit?: Habit; categories?: Pick<CategoryBudget,"id"|"name"|"active">[] }) {
  const { t, preferences } = useI18n();
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const [frequencyMode,setFrequencyMode]=useState(habit?.frequencyMode??"DAYS");
  return <form aria-busy={pending} className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setError(""); setMessage("");
    try { const result = habit ? await updateHabit(habit.id, new FormData(form)) : await createHabit(new FormData(form)); if (result.error) setError(result.error); else { setMessage(t("Hábito guardado. Se aplicará al próximo plan.")); if (!habit) form.reset(); } }
    catch { setError(t("No se pudo guardar.")); } finally { setPending(false); }
  }}>
    <h2 className="text-xl">{habit ? t("Editar hábito") : t("Una rutina nueva")}</h2>
    <label className="text-sm">{t("Qué quieres hacer")}<input name="title" required maxLength={160} defaultValue={habit?.title} placeholder={t("Ej. salir a caminar")} className="field" /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{t("Minutos")}<input name="durationMinutes" type="number" required min={5} max={480} defaultValue={habit?.durationMinutes ?? 30} className="field" /></label><label className="text-sm">{t("Prioridad")}<select name="priority" defaultValue={habit?.priority ?? 2} className="field"><option value="1">{t("Alta")}</option><option value="2">{t("Media")}</option><option value="3">{t("Baja")}</option></select></label></div>
    <label className="text-sm">{t("Momento preferido")}<select name="preferredWindow" defaultValue={habit?.preferredWindow ?? "ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    <label className="text-sm">{t("Categoría")}<select name="categoryId" defaultValue={habit?.categoryId??""} className="field"><option value="">{t("Sin categoría")}</option>{categories.filter(c=>c.active||c.id===habit?.categoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="text-sm">{t("Frecuencia")}<select name="frequencyMode" value={frequencyMode} onChange={e=>setFrequencyMode(e.target.value)} className="field"><option value="DAYS">{t("Días fijos")}</option><option value="WEEKLY">{t("Veces por semana · elegir mejores huecos")}</option></select></label>
    <label className={frequencyMode === "WEEKLY" ? "text-sm" : "hidden"}>{t("Objetivo semanal")}<input name="weeklyTarget" type="number" min={1} max={7} defaultValue={habit?.weeklyTarget??3} required className="field" /></label>
    <fieldset className={frequencyMode === "DAYS" ? "text-sm" : "hidden"}><legend>{t("Días de la semana")}</legend><div className="mt-2 flex flex-wrap gap-2">{orderedWeekdays(preferences.weekStartsOn).map(index => <label key={index} className="flex items-center gap-1 rounded-lg border border-line px-2 py-2"><input name="daysOfWeek" type="checkbox" value={index} defaultChecked={habit ? habit.daysOfWeek.includes(index) : true} />{weekdayLabel(index, preferences.locale)}</label>)}</div></fieldset>
    <label className="flex items-center gap-2 text-sm"><input name="required" type="checkbox" defaultChecked={habit?.required} />{t("Es esencial para mi día")}</label>
    {error && <p role="alert" className="text-sm text-terracotta">{t(error)}</p>}{message && <p role="status" className="text-sm text-sage">{t(message)}</p>}
    <button disabled={pending} className="rounded-full bg-sage py-2.5 text-white">{pending ? t("Guardando…") : habit ? t("Guardar cambios") : t("Añadir hábito")}</button>
  </form>;
}
