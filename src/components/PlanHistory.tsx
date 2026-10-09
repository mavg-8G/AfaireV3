import { prisma } from "@/lib/prisma";
import { captureAgenda, revisionSummary, stateHash, revisionFingerprint, revisionTimeline } from "@/lib/plan-history";
import { dateOnly } from "@/lib/time";
import { translator, displayDateTime, displayTime } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { ActionButton } from "./ActionButton";
import { undoDayPlan } from "@/app/actions/transparency";
export async function PlanHistory({userId,day,timezone}:{userId:string;day:string;timezone:string}) {
  const preferences=await getRequestPreferences(),t=translator(preferences.locale);
  const revisions=await prisma.planRevision.findMany({where:{userId,date:dateOnly(day)},orderBy:[{createdAt:"desc"},{id:"desc"}],take:8});
  if(!revisions.length)return null;
  const latest=revisions[0],now=new Date(),summary=revisionSummary(latest.before,latest.after,now);
  const same=stateHash(await captureAgenda(prisma,userId,day))===revisionFingerprint(latest.after);
  const canUndo=!latest.undoneAt&&latest.kind!=="UNDO"&&summary.restorable&&same;
  const labels:Record<string,string>={PLAN:"Replanificación",WORKER:"Plan automático",UNDO:"Plan anterior restaurado",MODE_NORMAL:"Día normal",MODE_SHORT:"Poco tiempo",MODE_DIFFICULT:"Día difícil"};
  return <section className="space-y-3 rounded-2xl border border-line bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">{t("Cambios del plan")}</h2>{canUndo&&<ActionButton action={undoDayPlan.bind(null,latest.id)}>{t("Deshacer la replanificación")}</ActionButton>}</div>
    {!canUndo&&latest.kind!=="UNDO"&&!latest.undoneAt&&<p className="text-xs text-muted">{t("Para deshacer, la agenda debe seguir igual y los bloques afectados deben estar pendientes, sin empezar ni quedar fijados.")}</p>}
    <details><summary className="text-sm text-sage">{t("Ver historial de cambios")}</summary><ol className="mt-3 space-y-3 text-sm">{revisions.map(row=>{const change=revisionSummary(row.before,row.after,now),timeline=revisionTimeline(row.before,row.after);return <li key={row.id} className="border-l-2 border-line pl-3"><p>{t(labels[row.kind]??"Replanificación")}{row.undoneAt?` · ${t("Deshecho")}`:""}</p><p className="mt-1 text-xs text-muted">{displayDateTime(row.createdAt,timezone,preferences)} · {t(`${change.removed} bloques anteriores y ${change.added} nuevos`)}</p><details className="mt-2"><summary className="text-xs text-sage">{t("Ver bloques que cambiaron")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["before","after"] as const).map(key=><div key={key}><p className="text-xs font-medium">{t(key==="before"?"Antes":"Después")}</p>{!timeline[key].length&&<p className="mt-1 text-xs text-muted">{t("Sin bloques")}</p>}<ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">{timeline[key].map(event=><li key={event.id}><span className="text-muted">{displayTime(event.startsAt,timezone,preferences)}–{displayTime(event.endsAt,timezone,preferences)}</span> · {event.title}</li>)}</ul></div>)}</div></details></li>;})}</ol><p className="mt-3 text-xs text-muted">{t("Se conservan los últimos 30 cambios de tu cuenta. Deshacer restaura el horario y las tareas pendientes; las tareas recién añadidas permanecen en la bandeja.")}</p></details>
  </section>;
}
