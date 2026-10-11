import { ActiveSessions } from "@/components/ActiveSessions";
import { translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
export default async function SessionsPage() {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser();
  const [legacyDevices, sessions] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: user.id, deviceSessionId: null } }),
    prisma.deviceSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, label: true, createdAt: true, lastSeenAt: true, expiresAt: true } }),
  ]);
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="eyebrow">{t("Tu cuenta")}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("Sesiones activas")}</h1></div>
    <ActiveSessions rows={sessions} legacyDevices={legacyDevices} currentId={user.currentSessionId} timezone={user.timezone} />
  </div>;
}
