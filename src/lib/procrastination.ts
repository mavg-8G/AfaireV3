import type { Event, Prisma } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "./transaction";
export async function recordPostponement(tx: Prisma.TransactionClient, event: Event, now: Date) {
  if (!event.taskId || event.postponedAt || !["PENDING", "IN_PROGRESS"].includes(event.status)) return;
  const marked = await tx.event.updateMany({ where: { id: event.id, userId: event.userId, postponedAt: null }, data: { postponedAt: now } });
  if (marked.count) await tx.task.updateMany({ where: { id: event.taskId, userId: event.userId, archived: false, status: { not: "DONE" } }, data: { postponements: { increment: 1 } } });
}
export const ResolutionSchema = z.object({ choice: z.enum(["SPLIT", "REDUCE", "DELEGATE", "DELETE", "KEEP"]), durationMinutes: z.coerce.number().int().min(5).max(480).optional(), delegatedTo: z.string().trim().max(100).optional(), parts: z.array(z.object({ title: z.string().trim().min(1).max(160), durationMinutes: z.number().int().min(5).max(480) })).min(2).max(6).optional() });
export async function resolveProcrastination(tx: Prisma.TransactionClient, userId: string, taskId: string, input: z.infer<typeof ResolutionSchema>, now = new Date()) {
  const task = await tx.task.findFirst({ where: { id: taskId, userId, archived: false, status: { in: ["INBOX", "SCHEDULED"] } } });
  if (!task) throw new DomainError("Esta tarea ya no está pendiente.");
  if (task.postponements - task.handledPostponements < 3) throw new DomainError("No hay tres aplazamientos nuevos para revisar.");
  const active = await tx.event.findMany({ where: { taskId, userId, status: { in: ["PENDING", "IN_PROGRESS"] } } });
  if (input.choice !== "KEEP" && active.some(event => event.status === "IN_PROGRESS" || event.startsAt <= now)) throw new DomainError("Devuelve el bloque a la bandeja antes de ajustar una tarea que ya empezó.");
  if (input.choice === "REDUCE" && (!input.durationMinutes || input.durationMinutes >= task.durationMinutes)) throw new DomainError("Introduce una duración menor que la actual, de al menos 5 minutos.");
  if (input.choice === "DELEGATE" && !input.delegatedTo) throw new DomainError("Indica a quién delegas la tarea.");
  if (input.choice === "SPLIT" && !input.parts) throw new DomainError("Escribe al menos dos pasos concretos.");
  if (input.choice !== "KEEP") await tx.event.updateMany({ where: { userId, taskId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (input.choice === "SPLIT") {
    for (const part of input.parts!) await tx.task.create({ data: { userId, ...part, categoryId: task.categoryId, dueDate: task.dueDate, availableFrom: task.availableFrom, priority: task.priority, preferredWindow: task.preferredWindow, energy: task.energy } });
  }
  await tx.task.update({ where: { id: taskId }, data: {
    handledPostponements: task.postponements,
    ...(input.choice === "REDUCE" ? { durationMinutes: input.durationMinutes, status: "INBOX" } : {}),
    ...(input.choice === "DELEGATE" ? { delegatedTo: input.delegatedTo, status: "CANCELLED" } : {}),
    ...(["SPLIT", "DELETE"].includes(input.choice) ? { archived: true, status: "CANCELLED" } : {}),
  } });
}
