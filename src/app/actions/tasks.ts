"use server";
import { revalidatePath } from "next/cache";
import { TaskFormSchema, type ActionResult } from "@/lib/definitions";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { setEventStatus } from "@/lib/calendar";
import { dateOnly } from "@/lib/time";
import type { Prisma } from "@prisma/client";

function parse(formData: FormData) {
  const result = TaskFormSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) throw new DomainError("Revisa el título, la duración y la fecha.");
  return { ...result.data, dueDate: result.data.dueDate ? dateOnly(result.data.dueDate) : null };
}
function refresh() { revalidatePath("/inbox"); revalidatePath("/"); revalidatePath("/week"); revalidatePath("/review"); }
async function owned(tx: Prisma.TransactionClient, userId: string, id: string) {
  const task = await tx.task.findFirst({ where: { id, userId, archived: false } });
  if (!task) throw new DomainError("Tarea no encontrada.");
  return task;
}
export async function createTask(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = parse(formData);
    await withUserLock(user.id, async tx => { await tx.task.create({ data: { ...data, userId: user.id } }); });
    refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function updateTask(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = parse(formData);
    await withUserLock(user.id, async tx => {
      const task = await owned(tx, user.id, id);
      if (task.status !== "INBOX") throw new DomainError("Devuelve la tarea a la bandeja antes de editarla.");
      await tx.task.update({ where: { id }, data });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function completeTask(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      await owned(tx, user.id, id);
      const active = await tx.event.findMany({ where: { taskId: id, userId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } });
      for (const event of active) await setEventStatus(tx, user.id, event.id, "DONE");
      await tx.task.update({ where: { id }, data: { status: "DONE" } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function deleteTask(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      await owned(tx, user.id, id);
      await tx.event.updateMany({ where: { taskId: id, userId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
      await tx.task.update({ where: { id }, data: { archived: true, status: "CANCELLED" } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function returnTaskToInbox(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const task = await owned(tx, user.id, id);
      if (task.status === "DONE") throw new DomainError("La tarea ya está completada.");
      await tx.event.updateMany({ where: { taskId: id, userId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
      await tx.task.update({ where: { id }, data: { status: "INBOX" } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
