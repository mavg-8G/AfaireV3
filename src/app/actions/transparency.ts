"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { DateSchema } from "@/lib/definitions";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { previewTaskPlan, confirmTaskPreview } from "@/lib/task-preview";
import { undoPlan } from "@/lib/plan-history";
import { FeedbackSchema, CheckInSchema, storeFeedback, closeDay } from "@/lib/plan-feedback";
import { ResolutionSchema, resolveProcrastination } from "@/lib/procrastination";
function refresh() { for (const path of ["/", "/week", "/inbox", "/habits", "/settings", "/review", "/check-in"]) revalidatePath(path); }
function parseDay(value: unknown) { const parsed=DateSchema.safeParse(value); if(!parsed.success)throw new DomainError("Fecha inválida."); return parsed.data; }
export async function previewTask(form: FormData, day: string) {
  const user=await requireUser();
  try { return { error: undefined, preview: await previewTaskPlan(user.id,form,parseDay(day)) }; } catch(error) { return { ...actionError(error), preview: undefined }; }
}
export async function applyTaskPreview(form: FormData, token: string) {
  const user=await requireUser();
  try { const result=await confirmTaskPreview(user.id,form,token);refresh();return {ok:true,error:undefined,...result}; } catch(error) { return actionError(error); }
}
export async function undoDayPlan(revisionId: string) {
  const user=await requireUser();
  try { await undoPlan(user.id,revisionId);refresh();return {ok:true,error:undefined}; } catch(error) { return actionError(error); }
}
export async function submitPlanFeedback(day: string, form: FormData) {
  const user=await requireUser();
  try {
    const values={...Object.fromEntries(form),eventId:form.get("eventId") || undefined,preferredWindow:form.get("preferredWindow") || undefined,suggestedMinutes:form.get("suggestedMinutes") || undefined};
    const parsed=FeedbackSchema.safeParse(values);if(!parsed.success)throw new DomainError("Revisa el motivo, la franja y la duración.");
    await withUserLock(user.id,tx=>storeFeedback(tx,user.id,parseDay(day),parsed.data));refresh();return {ok:true,error:undefined};
  } catch(error) { return actionError(error); }
}
export async function submitDayCheckIn(day: string, input: unknown) {
  const user=await requireUser();
  try { const parsed=CheckInSchema.safeParse(input);if(!parsed.success)throw new DomainError("Revisa las decisiones y los minutos reales.");const result=await withUserLock(user.id,tx=>closeDay(tx,user.id,parseDay(day),parsed.data));refresh();return {ok:true,error:undefined,...result}; } catch(error) { return actionError(error); }
}
export async function adjustPostponedTask(taskId: string, input: unknown) {
  const user=await requireUser();
  try { const parsed=ResolutionSchema.safeParse(input);if(!parsed.success)throw new DomainError("Revisa la duración, los pasos y la persona delegada.");await withUserLock(user.id,tx=>resolveProcrastination(tx,user.id,taskId,parsed.data));refresh();return {ok:true,error:undefined}; }catch(error){return actionError(error);}
}
const BudgetSchema=z.object({name:z.string().trim().min(1).max(80),weeklyMinutes:z.coerce.number().int().min(5).max(10080),preferredWindow:z.enum(["MORNING","AFTERNOON","EVENING","ANY"])});
export async function saveCategoryBudget(id: string | null, form: FormData) {
  const user=await requireUser();
  try {
    const parsed=BudgetSchema.safeParse({...Object.fromEntries(form),weeklyMinutes:Math.round(Number(form.get("weeklyHours"))*60)});if(!parsed.success)throw new DomainError("Indica nombre, horas semanales y franja. Mínimo 5 minutos; máximo 168 horas.");
    await withUserLock(user.id,async tx=>{
      if(id){const budget=await tx.categoryBudget.findFirst({where:{id,userId:user.id}});if(!budget)throw new DomainError("Categoría no encontrada.");await tx.categoryBudget.update({where:{id},data:parsed.data});}
      else await tx.categoryBudget.create({data:{userId:user.id,...parsed.data}});
    });refresh();return {ok:true,error:undefined};
  }catch(error){return actionError(error);}
}
export async function toggleCategoryBudget(id: string) {
  const user=await requireUser();
  try{await withUserLock(user.id,async tx=>{
    const category=await tx.categoryBudget.findFirst({where:{id,userId:user.id}});if(!category)throw new DomainError("Categoría no encontrada.");
    await tx.categoryBudget.update({where:{id},data:{active:!category.active}});
    if(category.active)await tx.event.updateMany({where:{userId:user.id,categoryId:id,taskId:null,habitId:null,source:"AUTO",locked:false,status:"PENDING",startsAt:{gt:new Date()}},data:{status:"CANCELLED"}});
  });refresh();return {ok:true,error:undefined};}catch(error){return actionError(error);}
}
