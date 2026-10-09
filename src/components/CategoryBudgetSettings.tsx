"use client";
import { useState } from "react";
import type { CategoryBudget } from "../generated/prisma/client";
import { saveCategoryBudget, toggleCategoryBudget } from "@/app/actions/transparency";
import { useI18n } from "./LocaleProvider";
import { ActionButton } from "./ActionButton";
import { WINDOW_LABELS } from "@/lib/definitions";
function BudgetForm({category}:{category?:CategoryBudget}) {
  const {t}=useI18n();const [pending,setPending]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
  return <form aria-busy={pending} className="grid gap-3 text-sm" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;setPending(true);setMessage("");try{const result=await saveCategoryBudget(category?.id??null,new FormData(form));setFailed(Boolean(result.error));setMessage(result.error??t("Objetivo guardado. Se aplicará al próximo plan."));if(!result.error&&!category)form.reset();}catch{setFailed(true);setMessage(t("No se pudo guardar."));}finally{setPending(false);}}}>
    <label>{t("Nombre de categoría")}<input name="name" required maxLength={80} defaultValue={category?.name} className="field" placeholder={t("Ej. estudio")} /></label><label>{t("Horas por semana")}<input name="weeklyHours" required type="number" min={0.0834} max={168} step="any" defaultValue={category?category.weeklyMinutes/60:5} className="field" /></label><label>{t("Momento preferido")}<select name="preferredWindow" defaultValue={category?.preferredWindow??"ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
    <button disabled={pending} className="btn">{t(category?"Guardar cambios":"Añadir objetivo")}</button>{message&&<p role={failed?"alert":"status"} className="text-xs">{t(message)}</p>}
  </form>;
}
export function CategoryBudgetSettings({categories}:{categories:CategoryBudget[]}) {
  const {t}=useI18n();return <section className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-sm"><h2 className="text-2xl">{t("Presupuesto de tiempo por categoría")}</h2><p className="text-sm text-muted">{t("Define objetivos semanales y asigna categorías a tareas o hábitos. El motor reserva bloques de categoría para cubrir lo que falte, respetando citas, urgencias, capacidad y descansos. Un objetivo no es un límite que elimine tareas.")}</p>
    <div className="grid items-start gap-6 md:grid-cols-2"><BudgetForm /><div className="space-y-3">{categories.map(category=><details key={category.id} className="rounded-xl border border-line p-3"><summary className="text-sm">{category.name} · {category.weeklyMinutes} {t("min/semana")}{!category.active?` · ${t("Pausado")}`:""}</summary><div className="mt-3 space-y-3"><BudgetForm category={category} /><ActionButton action={toggleCategoryBudget.bind(null,category.id)}>{t(category.active?"Pausar objetivo":"Activar objetivo")}</ActionButton></div></details>)}</div></div>
  </section>;
}
