"use client";
import { useRef, useState } from "react";
import { useI18n } from "./LocaleProvider";
import { displayTime } from "@/lib/locale";
import { submitDayCheckIn } from "@/app/actions/transparency";
export type CheckInBlock={id:string;title:string;startsAt:string;endsAt:string;updatedAt:string;taskId:string|null};
export function DayCheckInForm({day,events,timezone,saved}:{day:string;events:CheckInBlock[];timezone:string;saved:{mood:string;note:string|null}|null}) {
  const {t,preferences}=useI18n(),formRef=useRef<HTMLFormElement>(null);const [pending,setPending]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
  return <form ref={formRef} aria-busy={pending} className="space-y-5" onSubmit={async e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);const input={mood:data.get("mood"),note:data.get("note")??"",learn:data.get("learn")==="on",rows:events.map(event=>({id:event.id,updatedAt:event.updatedAt,decision:data.get("decision:"+event.id),...(data.get("minutes:"+event.id)?{actualMinutes:Number(data.get("minutes:"+event.id))}:{})}))};
    setPending(true);setMessage("");try{const result=await submitDayCheckIn(day,input);setFailed(Boolean(result.error));setMessage(result.error??t("Chequeo guardado. Los pendientes elegidos se han resuelto."));}catch{setFailed(true);setMessage(t("No se pudo guardar."));}finally{setPending(false);}
  }}>
    <section className="space-y-3 rounded-2xl border border-line bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl">{t("Qué pasó con los pendientes")}</h2>{events.length>0&&<button type="button" disabled={pending} className="rounded-full border border-line px-4 py-2 text-sm" onClick={()=>formRef.current?.querySelectorAll<HTMLSelectElement>('select[name^="decision:"]').forEach(select=>{select.value="DONE";})}>{t("Marcar todo como hecho")}</button>}</div>
      {!events.length&&<p className="text-sm text-sage">{t("No quedan bloques pendientes en este día.")}</p>}
      {events.map(event=><fieldset key={event.id} disabled={pending} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_180px_140px]"><div><p className="text-sm font-medium">{event.title}</p><p className="mt-1 text-xs text-muted">{displayTime(new Date(event.startsAt),timezone,preferences)}–{displayTime(new Date(event.endsAt),timezone,preferences)}</p></div><label className="text-xs">{t("Resultado")}<select name={"decision:"+event.id} defaultValue="KEEP" className="field"><option value="KEEP">{t("Dejar pendiente")}</option><option value="DONE">{t("Hecho")}</option>{event.taskId&&<option value="POSTPONE">{t("Posponer a mañana")}</option>}<option value="SKIP">{t("Omitir este día")}</option></select></label><label className="text-xs">{t("Minutos reales · opcional")}<input name={"minutes:"+event.id} type="number" min={1} max={480} className="field" /></label></fieldset>)}
      <p className="text-xs text-muted">{t("Los minutos reales se guardan solo para bloques marcados como hechos. Alimentan el ajuste de duraciones cuando está activado. Posponer u omitir una tarea la devuelve a la bandeja para mañana; los hábitos conservan sus días.")}</p>
    </section>
    <section className="grid gap-4 rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{t("Cómo fue el día")}</h2><label className="text-sm">{t("Balance")}<select name="mood" defaultValue={saved?.mood??"OK"} className="field"><option value="OK">{t("Bien")}</option><option value="BUSY">{t("Demasiado lleno")}</option><option value="DIFFICULT">{t("Día difícil")}</option></select></label><label className="text-sm">{t("Una nota para ti · opcional")}<textarea name="note" maxLength={500} defaultValue={saved?.note??""} className="field" rows={2} /></label><label className="flex items-start gap-2 text-sm"><input name="learn" type="checkbox" defaultChecked />{t("Usar un día lleno o difícil como señal de sobrecarga para reservar más holgura en próximos planes")}</label>
      <button disabled={pending} className="w-fit rounded-full bg-sage px-5 py-3 text-sm text-white">{pending?t("Guardando…"):t("Guardar chequeo del día")}</button>{message&&<p role={failed?"alert":"status"} className="text-sm">{t(message)}</p>}
    </section>
  </form>;
}
