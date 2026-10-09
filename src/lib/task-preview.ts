import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TaskFormSchema, DateSchema } from "./definitions";
import { dateOnly, calendarDayBounds, roundUp, ymdInZone } from "./time";
import { generateDayInTransaction } from "./planner";
import { captureAgenda, stateHash } from "./plan-history";
import { DomainError, withUserLock } from "./transaction";
import type { Event, Prisma } from "../generated/prisma/client";
const TokenSchema = z.object({ userId: z.string(), day: DateSchema, taskId: z.uuid(), inputHash: z.string().length(64), state: z.string().length(64), anchor: z.string().datetime(), expires: z.number() });
type Token = z.infer<typeof TokenSchema>;
function secret() { if (!process.env.AUTH_SECRET) throw new DomainError("La vista previa requiere configurar el servidor."); return process.env.AUTH_SECRET; }
export function signPreview(payload: Token) { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return body + "." + createHmac("sha256", secret()).update(body).digest("base64url"); }
export function verifyPreview(token: string, userId: string, now: Date) {
  if (typeof token !== "string" || token.length > 4096) throw new DomainError("Vista previa inválida. Vuelve a calcularla.");
  const parts = token.split("."), body = parts[0]; const signature = Buffer.from(parts[1] ?? "", "base64url");
  const expected = createHmac("sha256", secret()).update(body).digest();
  if (parts.length !== 2 || signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new DomainError("Vista previa inválida. Vuelve a calcularla.");
  let parsed;
  try { parsed = TokenSchema.safeParse(JSON.parse(Buffer.from(body,"base64url").toString())); } catch { throw new DomainError("Vista previa inválida. Vuelve a calcularla."); }
  if (!parsed.success || parsed.data.userId !== userId || parsed.data.expires < now.getTime() || parsed.data.expires > now.getTime()+300_000 || new Date(parsed.data.anchor)>now) throw new DomainError("La vista previa caducó o pertenece a otra cuenta. Vuelve a calcularla.");
  return parsed.data;
}
export function parseTaskInput(formData: FormData) {
  const parsed = TaskFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new DomainError("Revisa el título, la duración, la categoría y la fecha.");
  return { ...parsed.data, dueDate: parsed.data.dueDate ? dateOnly(parsed.data.dueDate) : null };
}
export async function assertCategory(tx: Prisma.TransactionClient, userId: string, categoryId?: string | null) {
  if (categoryId && !await tx.categoryBudget.findFirst({ where: { id: categoryId, userId } })) throw new DomainError("Categoría no encontrada.");
}
export type PreviewBlock = { key: string; title: string; startsAt: string; endsAt: string; fixed: boolean; addedTask: boolean };
export type TaskPreview = { token: string; day: string; before: PreviewBlock[]; after: PreviewBlock[]; skipped: string[]; taskFits: boolean; expiresAt: string };
class PreviewRollback extends Error { constructor(public readonly result: TaskPreview) { super("Read-only preview"); } }
function blocks(events: Event[], taskId: string): PreviewBlock[] { return events.filter(e=>!["CANCELLED","SKIPPED"].includes(e.status)).sort((a,b)=>a.startsAt.getTime()-b.startsAt.getTime()).map(e=>({key:e.taskId ?? e.habitId ?? e.id,title:e.title,startsAt:e.startsAt.toISOString(),endsAt:e.endsAt.toISOString(),fixed:e.locked || e.source==="MANUAL" || e.status!=="PENDING",addedTask:e.taskId===taskId})); }
export async function previewTaskPlan(userId: string, formData: FormData, requestedDay: string, now = new Date()): Promise<TaskPreview> {
  const day = DateSchema.parse(requestedDay), input = parseTaskInput(formData);
  try {
    return await withUserLock(userId, async tx => {
      await assertCategory(tx,userId,input.categoryId);
      const state = await captureAgenda(tx,userId,day), user = await tx.user.findUniqueOrThrow({where:{id:userId}}), bounds=calendarDayBounds(day,user.timezone);
      const taskId = randomUUID(), anchor=now.toISOString();
      const token=signPreview({userId,day,taskId,inputHash:stateHash(input),state:stateHash(state),anchor,expires:now.getTime()+300_000});
      await tx.task.create({data:{...input,userId,id:taskId,createdAt:now}});
      const result=await generateDayInTransaction(tx,userId,day,{now});
      const events=await tx.event.findMany({where:{userId,startsAt:{lt:bounds.end},endsAt:{gt:bounds.start}}});
      throw new PreviewRollback({token,day,before:blocks(state.events.filter(e=>e.startsAt<bounds.end&&e.endsAt>bounds.start),taskId),after:blocks(events,taskId),skipped:result.skipped,taskFits:events.some(e=>e.taskId===taskId&&e.status==="PENDING"),expiresAt:new Date(now.getTime()+300_000).toISOString()});
    });
  } catch (error) { if(error instanceof PreviewRollback)return error.result;throw error; }
}
export async function confirmTaskPreview(userId: string, formData: FormData, tokenValue: string, now = new Date()) {
  const token=verifyPreview(tokenValue,userId,now), input=parseTaskInput(formData);
  if(stateHash(input)!==token.inputHash)throw new DomainError("La tarea cambió después de la vista previa. Vuelve a calcularla.");
  return withUserLock(userId,async tx=>{
    const state=await captureAgenda(tx,userId,token.day), user=await tx.user.findUniqueOrThrow({where:{id:userId}}), anchor=new Date(token.anchor);
    if(stateHash(state)!==token.state || (token.day===ymdInZone(now,user.timezone) && roundUp(now).getTime()!==roundUp(anchor).getTime()))throw new DomainError("La agenda o la hora cambió. Vuelve a calcular la vista previa antes de confirmar.");
    await assertCategory(tx,userId,input.categoryId);
    await tx.task.create({data:{...input,userId,id:token.taskId,createdAt:anchor}});
    return generateDayInTransaction(tx,userId,token.day,{now:anchor});
  });
}
