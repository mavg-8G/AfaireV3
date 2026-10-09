import { operationMetrics } from "@/lib/operations";
import { translator } from "@/lib/locale";
export async function OperationMetrics({ userId, locale }: { userId: string; locale: string }) {
  const metrics = await operationMetrics(userId); const t = translator(locale);
  const number = (value: number | null, suffix: string) => value == null ? t("Sin mediciones") : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${suffix}`;
  return <section className="space-y-2 rounded-xl border border-line p-3 text-sm" aria-label={t("Métricas de operación")}>
    <h3 className="font-medium">{t("Métricas de operación · últimos 30 días")}</h3>
    <dl className="space-y-2"><div><dt className="text-muted">{t("Días con tareas sin espacio")}</dt><dd>{number(metrics.blockedDaysPercent, " %")} · {metrics.blockedDays}/{metrics.days} {t("días planificados")}</dd></div>
      <div><dt className="text-muted">{t("Tiempo medio de generación")}</dt><dd>{number(metrics.averageGenerationMs, " ms")} · {metrics.generationCount} {t("generaciones")}</dd></div>
      <div><dt className="text-muted">{t("Tasa de fallos push")}</dt><dd>{number(metrics.pushFailurePercent, " %")} · {metrics.pushFailed}/{metrics.pushAttempts} {t("intentos de envío")}</dd></div></dl>
    <p className="text-xs text-muted">{t("Se cuenta el último plan de cada día. Los intentos push incluyen reintentos y dispositivos caducados; las métricas empiezan con esta actualización.")}</p>
  </section>;
}
