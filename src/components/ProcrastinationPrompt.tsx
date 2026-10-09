"use client";
import { useState } from "react";
import type { Task } from "../generated/prisma/client";
import { adjustPostponedTask } from "@/app/actions/transparency";
import { useI18n } from "./LocaleProvider";
export function ProcrastinationPrompt({task}:{task:Task}) {
  const {t}=useI18n();const [choice,setChoice]=useState("REDUCE"),[pending,setPending]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
  if(!["INBOX","SCHEDULED"].includes(task.status)||task.postponements-task.handledPostponements<3)return null;
  return <details className="mt-4 rounded-xl border border-gold/40 bg-pending p-3"><summary className="text-sm">{t(`Esta tarea se ha pospuesto ${task.postponements} veces. ¿La ajustamos?`)}</summary><form aria-busy={pending} className="mt-3 grid gap-3 text-sm" onSubmit={async e=>{
    e.preventDefault();const form=new FormData(e.currentTarget),input={choice,...(choice==="REDUCE"?{durationMinutes:Number(form.get("durationMinutes"))}:{}),...(choice==="DELEGATE"?{delegatedTo:String(form.get("delegatedTo"))}:{}),...(choice==="SPLIT"?{parts:[1,2].map(i=>({title:String(form.get("partTitle"+i)),durationMinutes:Number(form.get("partMinutes"+i))}))}:{})};
    setPending(true);setMessage("");try{const result=await adjustPostponedTask(task.id,input);setFailed(Boolean(result.error));setMessage(result.error??t("Tarea ajustada."));}catch{setFailed(true);setMessage(t("No se pudo guardar."));}finally{setPending(false);}
  }}>
    <p className="text-xs text-muted">{t("Una señal para revisar el alcance, no una valoración personal. Los cambios se aplican a esta tarea; las siguientes repeticiones conservan su definición.")}</p>
    <label>{t("Cómo quieres continuar")}<select value={choice} onChange={e=>setChoice(e.target.value)} className="field"><option value="SPLIT">{t("Dividir en pasos")}</option><option value="REDUCE">{t("Reducir duración")}</option><option value="DELEGATE">{t("Delegar")}</option><option value="DELETE">{t("Eliminar tarea")}</option><option value="KEEP">{t("Mantener como está")}</option></select></label>
    {choice==="REDUCE"&&<label>{t("Nueva duración · minutos")}<input name="durationMinutes" type="number" required min={5} max={Math.max(5,task.durationMinutes-1)} defaultValue={Math.max(5,Math.floor(task.durationMinutes*.75/5)*5)} className="field" /></label>}
    {choice==="SPLIT"&&[1,2].map(i=><fieldset key={i} className="grid gap-2 rounded-lg border border-line p-2"><legend>{t(`Paso ${i}`)}</legend><label>{t("Qué necesitas hacer")}<input name={"partTitle"+i} required maxLength={160} defaultValue={task.title.slice(0,145)+` · ${t(`Paso ${i}`)}`} className="field" /></label><label>{t("Minutos")}<input name={"partMinutes"+i} type="number" required min={5} max={480} defaultValue={Math.max(5,Math.ceil(task.durationMinutes/2/5)*5)} className="field" /></label></fieldset>)}
    {choice==="DELEGATE"&&<><label>{t("Persona responsable")}<input name="delegatedTo" required maxLength={100} className="field" /></label><p className="text-xs text-muted">{t("Quedará registrada en la bandeja y saldrá del autoagendado. Puedes recuperarla cuando quieras.")}</p></>}
    {choice==="DELETE"&&<label className="flex items-center gap-2"><input type="checkbox" required />{t("Confirmo que quiero retirar esta tarea")}</label>}
    {choice==="KEEP"&&<p className="text-xs text-muted">{t("Se volverá a preguntar después de otros tres aplazamientos.")}</p>}
    <button disabled={pending} className="btn w-fit">{t("Aplicar ajuste")}</button>{message&&<p role={failed?"alert":"status"} className="text-xs">{t(message)}</p>}
  </form></details>;
}
