import { prisma } from "./prisma";

export const HEARTBEAT_MAX_AGE_MS = 5 * 60_000;
export function heartbeatHealthy(heartbeat: { updatedAt: Date } | null, now = new Date()) {
  return Boolean(heartbeat && now.getTime() - heartbeat.updatedAt.getTime() <= HEARTBEAT_MAX_AGE_MS);
}
export async function operationMetrics(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400_000);
  const [days, blockedDays, generations, push] = await Promise.all([
    prisma.dayPlan.count({ where: { userId, generatedAt: { gte: since }, generationCount: { gt: 0 } } }),
    prisma.dayPlan.count({ where: { userId, generatedAt: { gte: since }, generationCount: { gt: 0 }, unscheduledTaskCount: { gt: 0 } } }),
    prisma.dayPlan.aggregate({ where: { userId, generatedAt: { gte: since } }, _sum: { generationCount: true, generationTotalMs: true } }),
    prisma.workerRun.aggregate({ where: { userId, kind: "PUSH", attemptedAt: { gte: since } }, _sum: { pushSent: true, pushFailed: true, pushExpired: true } }),
  ]);
  const generationCount = generations._sum.generationCount ?? 0;
  const pushFailed = (push._sum.pushFailed ?? 0) + (push._sum.pushExpired ?? 0);
  const pushAttempts = (push._sum.pushSent ?? 0) + pushFailed;
  return { days, blockedDays, blockedDaysPercent: days ? blockedDays / days * 100 : null, generationCount, averageGenerationMs: generationCount ? (generations._sum.generationTotalMs ?? 0) / generationCount : null, pushAttempts, pushFailed, pushFailurePercent: pushAttempts ? pushFailed / pushAttempts * 100 : null };
}
