import { CategoryBudgetSettings } from "@/components/CategoryBudgetSettings";
import { displayDateTime, displayTime, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { ActiveSessions } from "@/components/ActiveSessions";
import { RegionalPreferences } from "@/components/RegionalPreferences";
import { PlanningExceptions } from "@/components/PlanningExceptions";
import { ymdInZone, dateOnly, addLocalDays, weekdayForDate } from "@/lib/time";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { SettingsForms } from "@/components/SettingsForms";
import { NotificationPreferences } from "@/components/NotificationPreferences";
export default async function SettingsPage() {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser();
  const legacyDevices = await prisma.pushSubscription.count({ where: { userId: user.id, deviceSessionId: null } });
  const sessions = await prisma.deviceSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, label: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
  const categories = await prisma.categoryBudget.findMany({where:{userId:user.id},orderBy:{name:"asc"}});
  const today = ymdInZone(new Date(), user.timezone);
  const daysToMonday = (user.weekStartsOn - weekdayForDate(today) + 7) % 7 || 7;
  const overrides = await prisma.dayOverride.findMany({ where: { userId: user.id, date: { gte: dateOnly(today) } }, orderBy: { date: "asc" }, take: 366 });
  const [settings, devices, heartbeat, pushHeartbeat, runs, pushErrors] = await Promise.all([
    prisma.notificationSettings.findUnique({ where: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.workerHeartbeat.findUnique({ where: { id: "daily-planner" } }),
    prisma.workerHeartbeat.findUnique({ where: { id: "push" } }),
    prisma.workerRun.findMany({ where: { userId: user.id }, orderBy: { attemptedAt: "desc" }, take: 10 }),
    prisma.pushDelivery.findMany({ where: { subscription: { userId: user.id }, error: { not: null }, sentAt: null }, orderBy: { attemptedAt: "desc" }, take: 5 }),
  ]);
  const configuredPush = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  const pushAlive = pushHeartbeat && new Date().getTime() - pushHeartbeat.updatedAt.getTime() < 10 * 60_000;
  const alive = heartbeat && new Date().getTime() - heartbeat.updatedAt.getTime() < 10 * 60_000;
  return <div className="space-y-6"><RegionalPreferences /><CategoryBudgetSettings categories={categories} /><SettingsForms profile={user} /><ActiveSessions rows={sessions} legacyDevices={legacyDevices} currentId={user.currentSessionId} timezone={user.timezone} /><PlanningExceptions today={today} monday={addLocalDays(today,daysToMonday)} rows={overrides} /><div className="grid items-start gap-6 lg:grid-cols-2"><NotificationPreferences settings={settings} devices={devices} publicKey={process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.VAPID_PUBLIC_KEY ?? null : null} /><section className="space-y-4 rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{t("Automatización")}</h2><p className={alive ? "text-sm text-sage" : "text-sm text-terracotta"}>{alive ? t("Planificador activo") : t("Planificador sin señal reciente")}{heartbeat && ` · ${displayDateTime(heartbeat.updatedAt, user.timezone, preferences)}`}</p><p className={pushAlive ? "text-sm text-sage" : "text-sm text-terracotta"}>{!configuredPush ? t("Envío de avisos pendiente de configurar") : pushAlive ? t("Envío de avisos activo") : t("Envío de avisos sin señal reciente")}{pushHeartbeat && ` · ${displayDateTime(pushHeartbeat.updatedAt, user.timezone, preferences)}`}</p><p className="text-xs text-muted">{t("Últimas generaciones y envíos de tu cuenta. Los fallos se conservan 30 días y se reintentan automáticamente.")}</p><ul className="space-y-3 text-sm">{runs.map(run => <li key={run.id}><strong className={run.status === "FAILED" ? "text-terracotta" : "text-sage"}>{run.kind === "PUSH" ? t("Avisos") : t("Plan diario")} · {run.status === "FAILED" ? t("Falló") : run.status === "EXPIRED" ? t("Dispositivo retirado") : t("Correcto")} · {run.date.toISOString().slice(0, 10)}</strong><span className="block text-xs text-muted">{displayDateTime(run.attemptedAt, user.timezone, preferences)} · {t(run.message ?? "")}{run.status === "FAILED" && run.retryAt && t(` · Próximo intento: ${displayTime(run.retryAt, user.timezone, preferences)}`)}</span></li>)}</ul>{!runs.length && <p className="text-sm text-muted">{t("Todavía no hay ejecuciones registradas para tu cuenta.")}</p>}{pushErrors.map(error => <p key={error.id} className="text-xs text-terracotta">{error.attempts >= 5 ? t("Aviso agotó sus reintentos") : t("Aviso pendiente")} · {error.error} {t(" · intento ")}{error.attempts}/5</p>)}</section></div></div>;
}
