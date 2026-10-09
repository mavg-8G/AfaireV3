import { weeklyCategoryProgress } from "@/lib/category-budgets";
import { prisma } from "@/lib/prisma";
import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
export async function CategoryProgress({userId,day}:{userId:string;day:string}) {
  const {locale}=await getRequestPreferences(),t=translator(locale),rows=await weeklyCategoryProgress(prisma,userId,day);
  if(!rows.length)return null;
  return <section className="space-y-3 rounded-2xl border border-line bg-card p-5 shadow-sm"><h2 className="text-xl">{t("Objetivos de la semana")}</h2><p className="text-xs text-muted">{t("Completado usa minutos reales cuando los has registrado. Reservado cuenta bloques pendientes; sin espacio se muestra lo que todavía falta asignar.")}</p><div className="grid gap-3 sm:grid-cols-2">{rows.map(row=><div key={row.id} className="rounded-xl border border-line p-3 text-sm"><p className="font-medium">{row.name} · {row.weeklyMinutes} {t("min/semana")}</p><progress aria-label={t(`Progreso de ${row.name}`)} max={row.weeklyMinutes} value={Math.min(row.weeklyMinutes,row.done+row.reserved)} className="mt-2 h-2 w-full accent-sage" /><p className="mt-2 text-xs text-muted">{row.done} {t("min completados")} · {row.reserved} {t("min reservados")}</p>{row.missing>0?<p className="mt-1 text-xs text-terracotta">{t(`Faltan ${row.missing} min por reservar para el objetivo semanal.`)}</p>:<p className="mt-1 text-xs text-sage">{t("Objetivo semanal cubierto")}</p>}</div>)}</div></section>;
}
