import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { capacityForecast } from "@/lib/capacity";
export async function CapacityWarnings({userId,day}:{userId:string;day:string}){
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
 const forecast=await capacityForecast(prisma,userId,day);
 if(!forecast.overloaded&&!forecast.risks.length)return null;
 const hours=(n:number)=>(n/60).toLocaleString(preferences.locale,{maximumFractionDigits:1});
 return <section className="space-y-3 rounded-2xl border border-gold/40 bg-pending p-5"><h2 className="text-xl">{t("Carga y fechas en riesgo")}</h2>{forecast.overloaded&&<p className="text-sm">{t("En los próximos 7 días tienes ")}{hours(forecast.taskMinutes)} {t(" h de tareas y ")}{hours(forecast.habitMinutes)} {t(" h de hábitos pendientes, frente a ")}{hours(forecast.freeMinutes)} {t(" h libres para planificar.")}</p>}<ul className="space-y-2 text-sm">{forecast.risks.slice(0,5).map(r=><li key={r.id}><strong>{r.title} · {r.dueDate}</strong><span className="block text-xs text-muted">{t(r.reason)}</span></li>)}</ul><p className="text-xs text-muted">{t("Estimación de capacidad con citas fijas, disponibilidad temporal y holgura. Los hábitos se incluyen como carga aproximada; los plazos se revisan hasta 28 días. Puedes reducir la carga, ampliar una ventana o ajustar la estimación.")}</p><Link href="/inbox" className="inline-block text-sm text-sage underline">{t("Revisar tareas y plazos →")}</Link></section>;
}
