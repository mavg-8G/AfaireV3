import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { validDeviceSession } from "./device-sessions";
import { getSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, timezone: true, locale: true, hourFormat: true, weekStartsOn: true, dayStart: true, dayEnd: true, bufferMinutes: true, autoPlan: true, carryOver: true, adaptiveAvailability: true, adaptiveDurations: true, focusWindow: true, slackPercent: true, longBlockMinutes: true, recoveryMinutes: true, onboardingCompleted: true, sessionVersion: true, availability: { orderBy: { weekday: "asc" } } },
  });
  if (!user || user.sessionVersion !== session.user.sessionVersion || !await validDeviceSession(user.id, session.user.deviceSessionId, session.user.sessionVersion)) return null;
  return { ...user, currentSessionId: session.user.deviceSessionId };
});
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
