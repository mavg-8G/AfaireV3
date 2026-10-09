import { prisma } from "@/lib/prisma";
import { heartbeatHealthy, HEARTBEAT_MAX_AGE_MS } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const heartbeat = await prisma.workerHeartbeat.findUnique({ where: { id: "daily-planner" } });
    const healthy = heartbeatHealthy(heartbeat);
    return Response.json({ status: healthy ? "ok" : "stale", worker: "daily-planner", updatedAt: heartbeat?.updatedAt ?? null, maxAgeMs: HEARTBEAT_MAX_AGE_MS }, { status: healthy ? 200 : 503, headers });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers }); }
}
