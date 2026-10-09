import type { Prisma } from "@prisma/client";
import { durationSuggestion } from "./insights";
import { DomainError } from "./transaction";
import { taskMeasurements } from "./duration-learning";
export { normalizedTitle } from "./duration-learning";
export async function taskDurationSuggestions(tx: Prisma.TransactionClient, userId: string) {
  const [tasks, history] = await Promise.all([
    tx.task.findMany({ where: { userId, archived: false, status: "INBOX" } }),
    tx.event.findMany({ where: { userId, status: "DONE", chunkIndex: null, taskId: { not: null }, actualMinutes: { not: null } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], include: { task: true } }),
  ]);
  return tasks.flatMap(task => {
    const suggestion = durationSuggestion(task.durationMinutes, taskMeasurements(task, history));
    return suggestion ? [{ taskId: task.id, title: task.title, ...suggestion }] : [];
  });
}
export async function applyTaskDurationSuggestion(tx: Prisma.TransactionClient, userId: string, taskId: string) {
  const suggestion = (await taskDurationSuggestions(tx, userId)).find(s => s.taskId === taskId);
  if (!suggestion) throw new DomainError("Ya no hay un ajuste disponible para esta tarea pendiente. Actualiza la página.");
  await tx.task.update({ where: { id: taskId }, data: { durationMinutes: suggestion.suggested } });
  return suggestion;
}
