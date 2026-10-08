import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { SettingsForms } from "@/components/SettingsForms";
import { NotificationPreferences } from "@/components/NotificationPreferences";
export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, devices, heartbeat, runs, pushErrors] = await Promise.all([
    prisma.notificationSettings.findUnique({ where: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.workerHeartbeat.findUnique({ where: { id: "daily-planner" } }),
    prisma.workerRun.findMany({ where: { userId: user.id }, orderBy: { attemptedAt: "desc" }, take: 10 }),
    prisma.pushDelivery.findMany({ where: { subscription: { userId: user.id }, error: { not: null }, sentAt: null }, orderBy: { attemptedAt: "desc" }, take: 5 }),
  ]);
  const alive = heartbeat && new Date().getTime() - heartbeat.updatedAt.getTime() < 10 * 60_000;
  return <div className="space-y-6"><SettingsForms profile={user} /><div className="grid items-start gap-6 lg:grid-cols-2"><NotificationPreferences settings={settings} devices={devices} publicKey={process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.VAPID_PUBLIC_KEY ?? null : null} /><section className="space-y-4 rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">Automatización</h2><p className={alive ? "text-sm text-sage" : "text-sm text-terracotta"}>{alive ? "Worker activo" : "Worker sin señal reciente"}{heartbeat && ` · ${heartbeat.updatedAt.toLocaleString("es", { timeZone: user.timezone })}`}</p><p className="text-xs text-muted">Últimas generaciones automáticas de tu cuenta. Los fallos se conservan 30 días y se reintentan automáticamente.</p><ul className="space-y-3 text-sm">{runs.map(run => <li key={run.id}><strong className={run.status === "FAILED" ? "text-terracotta" : "text-sage"}>{run.status === "FAILED" ? "Falló" : "Generado"} · {run.date.toISOString().slice(0, 10)}</strong><span className="block text-xs text-muted">{run.attemptedAt.toLocaleString("es", { timeZone: user.timezone })} · {run.message}{run.status === "FAILED" && run.retryAt && ` · Próximo intento: ${run.retryAt.toLocaleTimeString("es", { timeZone: user.timezone })}`}</span></li>)}</ul>{!runs.length && <p className="text-sm text-muted">Todavía no hay ejecuciones registradas para tu cuenta.</p>}{pushErrors.map(error => <p key={error.id} className="text-xs text-terracotta">Aviso pendiente · {error.error} · intento {error.attempts}/5</p>)}</section></div></div>;
}
