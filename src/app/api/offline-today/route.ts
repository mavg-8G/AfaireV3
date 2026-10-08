import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { calendarDayBounds, formatTime, ymdInZone } from "@/lib/time";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  const now = new Date(); const day = ymdInZone(now, user.timezone); const bounds = calendarDayBounds(day, user.timezone);
  const events = await prisma.event.findMany({ where: { userId: user.id, status: { not: "CANCELLED" }, startsAt: { lt: bounds.end }, endsAt: { gt: bounds.start } }, orderBy: { startsAt: "asc" } });
  return Response.json({ owner: user.id, day, timezone: user.timezone, savedAt: now.toISOString(), expiresAt: bounds.end.toISOString(), events: events.map(e => ({ title: e.title, start: formatTime(e.startsAt, user.timezone), end: formatTime(e.endsAt, user.timezone), status: e.status, location: e.location })) }, { headers });
}
