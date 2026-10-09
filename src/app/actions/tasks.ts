"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult } from "@/lib/definitions";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { setEventStatus } from "@/lib/calendar";
import { parseTaskInput, assertCategory } from "@/lib/task-preview";
import { applyTaskDurationSuggestion } from "@/lib/duration-suggestions";
import type { Prisma } from "@prisma/client";

const parse = parseTaskInput;
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
    await withUserLock(user.id, async tx => { await assertCategory(tx, user.id, data.categoryId); await tx.task.create({ data: { ...data, userId: user.id } }); });
    refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function updateTask(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = parse(formData);
    await withUserLock(user.id, async tx => {
      await assertCategory(tx, user.id, data.categoryId);
      const task = await owned(tx, user.id, id);
      if (task.seriesId && (!data.dueDate || (task.availableFrom && data.dueDate < task.availableFrom))) throw new DomainError("Una repetición necesita una fecha límite posterior o igual a su apertura.");
      if (task.status !== "INBOX") throw new DomainError("Devuelve la tarea a la bandeja antes de editarla.");
      await tx.task.update({ where: { id }, data });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function completeTask(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const task = await owned(tx, user.id, id);
      const active = await tx.event.findMany({ where: { taskId: id, userId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } });
      const fragments = await tx.event.findMany({ where: { taskId: id, userId: user.id, chunkIndex: { not: null } } });
      if (fragments.length) {
        const completed = await tx.event.findMany({ where: { taskId: id, userId: user.id, status: "DONE" } });
        const accounted = [...completed, ...active].reduce((n,event) => n + (event.estimatedMinutes ?? (event.endsAt.getTime() - event.startsAt.getTime()) / 60000), 0);
        if (accounted < task.durationMinutes) throw new DomainError("Aún quedan fragmentos sin programar. Organiza el trabajo pendiente antes de completar la tarea.");
      }
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
      const active = await tx.event.findMany({ where: { taskId: id, userId: user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } });
      for (const event of active) await setEventStatus(tx, user.id, event.id, "CANCELLED", { postpone: true });
      await tx.task.update({ where: { id }, data: { status: "INBOX", delegatedTo: null } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}

export async function acceptDurationSuggestion(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, tx => applyTaskDurationSuggestion(tx, user.id, id));
    refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
