import Link from "next/link";
import { CategoryBudgetSettings } from "@/components/CategoryBudgetSettings";
import { OperationMetrics } from "@/components/OperationMetrics";
import { heartbeatHealthy } from "@/lib/operations";
import { displayDateTime, displayTime, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { RegionalPreferences } from "@/components/RegionalPreferences";
import { PlanningExceptions } from "@/components/PlanningExceptions";
import { ymdInZone, dateOnly, addLocalDays, weekdayForDate } from "@/lib/time";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { SettingsForms } from "@/components/SettingsForms";
import { NotificationPreferences } from "@/components/NotificationPreferences";

const TABS = [
  { key: "schedule", label: "Horario y plan" },
  { key: "categories", label: "Categorías" },
  { key: "special-days", label: "Días especiales" },
  { key: "notifications", label: "Avisos" },
  { key: "general", label: "General" },
] as const;
type Tab = typeof TABS[number]["key"];

async function SystemStatus({ userId, timezone }: { userId: string; timezone: string }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const [heartbeat, pushHeartbeat, runs, pushErrors] = await Promise.all([
    prisma.workerHeartbeat.findUnique({ where: { id: "daily-planner" } }),
    prisma.workerHeartbeat.findUnique({ where: { id: "push" } }),
    prisma.workerRun.findMany({ where: { userId }, orderBy: { attemptedAt: "desc" }, take: 10 }),
    prisma.pushDelivery.findMany({ where: { subscription: { userId }, error: { not: null }, sentAt: null }, orderBy: { attemptedAt: "desc" }, take: 5 }),
  ]);
  const configuredPush = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  const pushAlive = pushHeartbeat && new Date().getTime() - pushHeartbeat.updatedAt.getTime() < 10 * 60_000;
  const alive = heartbeatHealthy(heartbeat);
  return <section className="space-y-4 rounded-3xl border border-line bg-card p-5 shadow-md">
    <h2 className="text-2xl">{t("Automatización")}</h2>
    <div className="space-y-1">
      <p className={alive ? "text-sm text-sage" : "text-sm text-terracotta"}>{alive ? t("Planificador activo") : t("Planificador sin señal reciente")}{heartbeat && ` · ${displayDateTime(heartbeat.updatedAt, timezone, preferences)}`}</p>
      {!alive && <p role="alert" className="text-sm text-terracotta">{t("Alerta: el planificador lleva más de cinco minutos sin señal o aún no ha iniciado.")}</p>}
      <p className={pushAlive ? "text-sm text-sage" : "text-sm text-terracotta"}>{!configuredPush ? t("Envío de avisos pendiente de configurar") : pushAlive ? t("Envío de avisos activo") : t("Envío de avisos sin señal reciente")}{pushHeartbeat && ` · ${displayDateTime(pushHeartbeat.updatedAt, timezone, preferences)}`}</p>
    </div>
    <details className="rounded-xl border border-line px-3"><summary className="text-sm font-medium">{t("Detalles técnicos")}</summary>
      <div className="space-y-4 pb-3 pt-1">
        <OperationMetrics userId={userId} locale={preferences.locale} />
        <p className="text-xs text-muted">{t("Últimas generaciones y envíos de tu cuenta. Los fallos se conservan 30 días y se reintentan automáticamente.")}</p>
        <ul className="space-y-3 text-sm">{runs.map(run => <li key={run.id}><strong className={run.status === "FAILED" ? "text-terracotta" : "text-sage"}>{run.kind === "PUSH" ? t("Avisos") : t("Plan diario")} · {run.status === "FAILED" ? t("Falló") : run.status === "EXPIRED" ? t("Dispositivo retirado") : t("Correcto")} · {run.date.toISOString().slice(0, 10)}</strong><span className="block text-xs text-muted">{displayDateTime(run.attemptedAt, timezone, preferences)} · {t(run.message ?? "")}{run.status === "FAILED" && run.retryAt && t(` · Próximo intento: ${displayTime(run.retryAt, timezone, preferences)}`)}</span></li>)}</ul>
        {!runs.length && <p className="text-sm text-muted">{t("Todavía no hay ejecuciones registradas para tu cuenta.")}</p>}
        {pushErrors.map(error => <p key={error.id} className="text-xs text-terracotta">{error.attempts >= 5 ? t("Aviso agotó sus reintentos") : t("Aviso pendiente")} · {error.error} {t(" · intento ")}{error.attempts}/5</p>)}
      </div>
    </details>
  </section>;
}

async function TabContent({ tab }: { tab: Tab }) {
  const user = await requireUser();
  switch (tab) {
    case "categories":
      return <CategoryBudgetSettings categories={await prisma.categoryBudget.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })} />;
    case "special-days": {
      const today = ymdInZone(new Date(), user.timezone);
      const daysToMonday = (user.weekStartsOn - weekdayForDate(today) + 7) % 7 || 7;
      const overrides = await prisma.dayOverride.findMany({ where: { userId: user.id, date: { gte: dateOnly(today) } }, orderBy: { date: "asc" }, take: 366 });
      return <PlanningExceptions today={today} monday={addLocalDays(today, daysToMonday)} rows={overrides} />;
    }
    case "notifications": {
      const [settings, devices] = await Promise.all([
        prisma.notificationSettings.findUnique({ where: { userId: user.id } }),
        prisma.pushSubscription.count({ where: { userId: user.id } }),
      ]);
      return <NotificationPreferences settings={settings} devices={devices} publicKey={process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.VAPID_PUBLIC_KEY ?? null : null} />;
    }
    case "general":
      return <div className="space-y-6"><RegionalPreferences /><SystemStatus userId={user.id} timezone={user.timezone} /></div>;
    default:
      return <SettingsForms profile={user} />;
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find(item => item.key === requested)?.key ?? "schedule";
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="eyebrow">{t("Preferencias")}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("Ajustes")}</h1></div>
    <nav aria-label={t("Secciones de ajustes")} className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-full bg-sunken p-1">
        {TABS.map(item => <li key={item.key}><Link href={item.key === "schedule" ? "/settings" : `/settings?tab=${item.key}`} aria-current={item.key === tab ? "page" : undefined}
          className={`flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition ${item.key === tab ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{t(item.label)}</Link></li>)}
      </ul>
    </nav>
    <TabContent tab={tab} />
  </div>;
}
