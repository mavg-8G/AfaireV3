"use server";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { ExceptionSchema, applyException, clearFlexiblePlans } from "@/lib/exceptions";
import { DateSchema, type ActionResult } from "@/lib/definitions";
import { addLocalDays, dateOnly, weekdayForDate, ymdInZone } from "@/lib/time";
import { TaskSeriesSchema } from "@/lib/task-series-schema";
import { materializeTaskSeries } from "@/lib/task-series";
import { createBundleTasks, createTemplateWeek, stopTaskSeries } from "@/lib/planning-templates";
import { TASK_BUNDLES, WEEK_TEMPLATES } from "@/lib/templates";
import { generateDay } from "@/lib/planner";
import { revalidatePath } from "next/cache";
function refresh() { revalidatePath("/", "layout"); }
export async function saveException(form: FormData): Promise<ActionResult> {
 const user = await requireUser(), parsed = ExceptionSchema.safeParse(Object.fromEntries(form));
 if (!parsed.success) return { error: "Revisa fechas, rango máximo de 366 días y horas." };
 try { await withUserLock(user.id, tx => applyException(tx, user.id, parsed.data)); refresh(); return { ok: true }; } catch(error) { return actionError(error); }
}
export async function removeException(id: string): Promise<ActionResult> {
 const user = await requireUser();
 try { await withUserLock(user.id, async tx => { const row = await tx.dayOverride.findFirst({ where: { id, userId: user.id } }); if (!row) throw new DomainError("Excepción no encontrada."); const day = row.date.toISOString().slice(0,10); await tx.dayOverride.delete({where:{id}}); await clearFlexiblePlans(tx,user.id,day,day,user.timezone,new Date()); }); refresh(); return {ok:true}; } catch(error) { return actionError(error); }
}
export async function setDayMode(day: string, mode: "NORMAL" | "SHORT" | "DIFFICULT"): Promise<ActionResult> {
 const user = await requireUser();
 if (!["NORMAL","SHORT","DIFFICULT"].includes(mode)) return {error:"Modo inválido."};
 try { await generateDay(user.id, day, { dayMode: mode }); refresh(); return {ok:true}; } catch(error) { return actionError(error); }
}
export async function createFlexibleSeries(form: FormData): Promise<ActionResult> {
 const user = await requireUser(), parsed = TaskSeriesSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:"Revisa la repetición y la ventana (1–7 días semanal; 1–31 mensual)."};
 try { await withUserLock(user.id, async tx => { await tx.taskSeries.create({data:{...parsed.data,anchorDate:dateOnly(parsed.data.anchorDate),userId:user.id}}); const today=ymdInZone(new Date(),user.timezone); await materializeTaskSeries(tx,user.id,today,addLocalDays(today,90)); }); refresh(); return {ok:true}; } catch(error) { return actionError(error); }
}
export async function stopFlexibleSeries(id: string): Promise<ActionResult> {
 const user=await requireUser();
 try { await withUserLock(user.id,tx=>stopTaskSeries(tx,user.id,id));refresh();return {ok:true}; }catch(error){return actionError(error);}
}
export async function applyTaskBundle(form: FormData): Promise<ActionResult> {
 const user=await requireUser(),date=DateSchema.safeParse(form.get("date")),bundle=TASK_BUNDLES.find(t=>t.key===form.get("template"));
 if(!date.success||!bundle)return {error:"Elige una plantilla y una fecha válida."};
 try { await withUserLock(user.id,tx=>createBundleTasks(tx,user.id,bundle.key,date.data));refresh();return {ok:true}; }catch(error){return actionError(error);}
}
export async function applyWeekTemplate(form: FormData): Promise<ActionResult> {
 const user=await requireUser(),date=DateSchema.safeParse(form.get("date")),template=WEEK_TEMPLATES.find(t=>t.key===form.get("template"));
 if(!date.success||!template||weekdayForDate(date.data)!==user.weekStartsOn)return {error:"Elige el primer día de tu semana y una plantilla."};
 try { await withUserLock(user.id,tx=>createTemplateWeek(tx,user.id,template.key,date.data));refresh();return {ok:true}; }catch(error){return actionError(error);}
}
