import { addLocalDays, dateOnly } from "./time";
import type { Prisma, TaskSeries } from "@prisma/client";
export function taskPeriods(series: Pick<TaskSeries, "frequency" | "anchorDate" | "windowDays">, from: string, until: string) {
  const anchor = series.anchorDate.toISOString().slice(0, 10);
  const dates: string[] = [];
  if (series.frequency === "WEEKLY") {
    const delta = Math.max(0, Math.floor((dateOnly(from).getTime() - series.anchorDate.getTime()) / 86400000 / 7));
    for (let day = addLocalDays(anchor, delta * 7); day <= until; day = addLocalDays(day, 7)) dates.push(day);
  } else {
    const original = Number(anchor.slice(-2));
    let month = new Date(from.slice(0, 7) + "-01T00:00Z");
    if (month < new Date(anchor.slice(0, 7) + "-01T00:00Z")) month = new Date(anchor.slice(0, 7) + "-01T00:00Z");
    // Include the previous period when its fulfilment window still overlaps from.
    month.setUTCMonth(month.getUTCMonth() - 1);
    for (let count = 0; count < 15; count++) {
      const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      const day = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(original, last))).toISOString().slice(0, 10);
      if (day > until) break;
      if (day >= anchor) dates.push(day);
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
  return dates.map(day => ({ periodStart: dateOnly(day), availableFrom: dateOnly(day), dueDate: dateOnly(addLocalDays(day, series.windowDays - 1)) })).filter(p => p.dueDate >= dateOnly(from));
}
export async function materializeTaskSeries(tx: Prisma.TransactionClient, userId: string, from: string, until: string) {
  const series = await tx.taskSeries.findMany({ where: { userId, active: true } });
  for (const rule of series) {
    const periods = taskPeriods(rule, from, until);
    const existing = await tx.task.findMany({ where: { userId, seriesId: rule.id, periodStart: { in: periods.map(p=>p.periodStart) } }, select: { periodStart:true } });
    const keys = new Set(existing.map(t=>t.periodStart!.getTime()));
    const missing = periods.filter(p=>!keys.has(p.periodStart.getTime()));
    if (missing.length) await tx.task.createMany({ data: missing.map(period => ({ ...period, userId, seriesId: rule.id, title: rule.title, durationMinutes: rule.durationMinutes, priority: rule.priority, preferredWindow: rule.preferredWindow, energy: rule.energy })), skipDuplicates: true });
  }
}
