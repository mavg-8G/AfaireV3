"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useRef, useState } from "react";
import type { CategoryBudget, Task } from "@prisma/client";
import { createTask, updateTask } from "@/app/actions/tasks";
import { previewTask, applyTaskPreview } from "@/app/actions/transparency";
import type { TaskPreview } from "@/lib/task-preview";
import { displayTime } from "@/lib/locale";
import { WINDOW_LABELS } from "@/lib/definitions";
export function TaskForm({ task, categories = [], today, timezone = "UTC" }: { task?: Task; categories?: Pick<CategoryBudget,"id"|"name"|"active">[]; today?: string; timezone?: string }) {
  const { t, preferences } = useI18n(); const formRef=useRef<HTMLFormElement>(null);
  const [error,setError]=useState(""),[pending,setPending]=useState(false),[message,setMessage]=useState(""),[preview,setPreview]=useState<TaskPreview|null>(null),[day,setDay]=useState(today??"");
  async function simulate() {
    if(!formRef.current?.reportValidity())return;
    setPending(true);setError("");setMessage("");setPreview(null);
    try {const result=await previewTask(new FormData(formRef.current),day);if(result.error)setError(result.error);else if(result.preview)setPreview(result.preview);}catch{setError(t("No se pudo calcular la vista previa."));}finally{setPending(false);}
  }
  async function confirm() {
    if(!preview || !formRef.current?.reportValidity())return;
    setPending(true);setError("");setMessage("");
    try {const result=await applyTaskPreview(new FormData(formRef.current),preview.token);if(result.error){setError(result.error);setPreview(null);}else{formRef.current.reset();setPreview(null);setMessage(t("Tarea guardada y plan aplicado. Puedes deshacer la replanificación desde la agenda."));}}catch{setError(t("No se pudo guardar."));}finally{setPending(false);}
  }
  return <form ref={formRef} aria-busy={pending} onChange={()=>setPreview(null)} className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event=>{
    event.preventDefault();const form=event.currentTarget;setPending(true);setError("");setMessage("");
    try{const result=task?await updateTask(task.id,new FormData(form)):await createTask(new FormData(form));if(result.error)setError(result.error);else{setPreview(null);setMessage(t("Tarea guardada."));if(!task)form.reset();}}catch{setError(t("No se pudo guardar."));}finally{setPending(false);}
  }}>
    <h2 className="text-xl">{task?t("Editar tarea"):t("Sácalo de tu cabeza")}</h2>
    <fieldset disabled={pending} className="contents">
      <label className="text-sm">{t("Qué necesitas hacer")}<input name="title" required maxLength={160} defaultValue={task?.title} placeholder={t("Ej. preparar la propuesta")} className="field" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">{t("Minutos")}<input name="durationMinutes" required type="number" min={5} max={480} defaultValue={task?.durationMinutes??30} className="field" /></label><label className="text-sm">{t("Prioridad")}<select name="priority" defaultValue={task?.priority??2} className="field"><option value="1">{t("Alta")}</option><option value="2">{t("Media")}</option><option value="3">{t("Baja")}</option></select></label></div>
      <label className="text-sm">{t("Momento preferido")}<select name="preferredWindow" defaultValue={task?.preferredWindow??"ANY"} className="field">{Object.entries(WINDOW_LABELS).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label className="text-sm">{t("Energía")}<select name="energy" defaultValue={task?.energy??"LIGHT"} className="field"><option value="LIGHT">{t("Ligera")}</option><option value="DEEP">{t("Profunda · priorizar mi franja de foco")}</option></select></label>
      <label className="text-sm">{t("Categoría")}<select name="categoryId" defaultValue={task?.categoryId??""} className="field"><option value="">{t("Sin categoría")}</option>{categories.filter(c=>c.active || c.id===task?.categoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm">{t("Fecha límite")}{task?.seriesId?t(" · fin de la ventana"):t(" · opcional")}<input name="dueDate" type="date" required={Boolean(task?.seriesId)} min={task?.availableFrom?.toISOString().slice(0,10)} defaultValue={task?.dueDate?.toISOString().slice(0,10)} className="field" /></label>
      {!task&&today&&<><label className="text-sm">{t("¿Y si la añado a este día?")}<input aria-label={t("Día de la vista previa")} type="date" required min={today} value={day} onChange={e=>setDay(e.target.value)} className="field" /></label><button type="button" onClick={simulate} className="rounded-full border border-sage px-4 py-2 text-sm text-sage">{pending?t("Calculando…"):t("Ver cómo cambiaría el plan")}</button></>}
      <button className="rounded-full bg-sage py-2.5 text-white">{pending?t("Guardando…"):task?t("Guardar cambios"):t("Guardar en la bandeja")}</button>
    </fieldset>
    {preview&&<section aria-label={t("Vista previa del plan")} className="space-y-3 rounded-xl border border-sage/40 bg-paper p-3 text-sm">
      <h3 className="text-lg">{t("Vista previa · sin cambios guardados")}</h3><p className="text-xs text-muted">{t("Las citas y los bloques fijados se conservan. La vista previa caduca en cinco minutos o si cambia la agenda o la hora disponible.")}</p>
      <div className="grid gap-3"><div><h4 className="font-medium">{t("Antes")}</h4>{!preview.before.length&&<p className="text-xs text-muted">{t("Sin bloques")}</p>}<ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{preview.before.map((block,i)=><li key={block.key+":"+i} className="text-xs"><span className="text-muted">{displayTime(new Date(block.startsAt),timezone,preferences)}–{displayTime(new Date(block.endsAt),timezone,preferences)}</span> · {block.title}{block.fixed?` · ${t("Fijo")}`:""}</li>)}</ul></div>
      <div><h4 className="font-medium">{t("Después")}</h4><ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">{preview.after.map((block,i)=><li key={block.key+":"+i} className={`rounded-lg p-2 text-xs ${block.addedTask?"border border-sage bg-card":""}`}><span className="text-muted">{displayTime(new Date(block.startsAt),timezone,preferences)}–{displayTime(new Date(block.endsAt),timezone,preferences)}</span> · {block.title}{block.addedTask?` · ${t("Nueva tarea")}`:block.fixed?` · ${t("Fijo")}`:preview.before.some(old=>old.key===block.key&&old.startsAt!==block.startsAt)?` · ${t("Se mueve")}`:""}</li>)}</ul></div></div>
      {!preview.taskFits&&<p className="text-terracotta">{t("La nueva tarea no cabe y seguirá en la bandeja si confirmas.")}</p>}{preview.skipped.length>0&&<div className="text-xs"><p className="font-medium">{t("Sin espacio")}</p><ul className="mt-1 space-y-1">{preview.skipped.map((title,i)=><li key={i}>{title}</li>)}</ul></div>}
      <button type="button" disabled={pending} onClick={confirm} className="w-full rounded-full bg-sage px-4 py-2 text-white">{t("Confirmar tarea y aplicar este plan")}</button><button type="button" disabled={pending} onClick={()=>setPreview(null)} className="w-full rounded-full border border-line px-4 py-2">{t("Descartar vista previa")}</button>
    </section>}
    {error&&<p role="alert" className="text-sm text-terracotta">{t(error)}</p>}{message&&<p role="status" className="text-sm text-sage">{t(message)}</p>}
  </form>;
}
