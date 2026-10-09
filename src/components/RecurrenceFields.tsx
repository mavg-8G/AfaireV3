"use client";
import { useI18n } from "./LocaleProvider";
import { orderedWeekdays, weekdayLabel } from "@/lib/locale";
import { addLocalDays } from "@/lib/time";
export function RecurrenceFields({ date, frequency = "NONE", until, weekdays = [] }: { date: string; frequency?: string; until?: string; weekdays?: number[] }) {
  const { preferences, t } = useI18n();
  return <fieldset className="space-y-3 rounded-xl border border-line p-3"><legend className="px-1 text-sm font-medium">{t("Repetición")}</legend>
    <label className="block text-sm">{t("Frecuencia")}<select name="frequency" defaultValue={frequency} className="field"><option value="NONE">{t("No se repite")}</option><option value="DAILY">{t("Diaria")}</option><option value="WEEKLY">{t("Semanal por días")}</option><option value="MONTHLY">{t("Mensual · mismo día del mes")}</option></select></label>
    <div role="group" aria-label={t("Días de la semana")} className="flex flex-wrap gap-1.5">{orderedWeekdays(preferences.weekStartsOn).map(i => <label key={i} className="relative flex min-h-10 min-w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-card px-2.5 text-xs font-semibold capitalize text-muted transition has-checked:border-sage has-checked:bg-sage-soft has-checked:text-sage has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-sage"><input type="checkbox" name="weekdays" value={i} defaultChecked={weekdays.includes(i)} className="sr-only" />{weekdayLabel(i, preferences.locale)}</label>)}</div>
    <p className="text-xs text-muted">{t("Los días se usan en la repetición semanal. La mensual omite meses que no tengan ese día.")}</p>
    <label className="block text-sm">{t("Última fecha de repetición")}<input name="until" type="date" defaultValue={until ?? addLocalDays(date, 90)} className="field" /></label>
    <p className="text-xs text-muted">{t("Hasta 366 días desde el inicio. Todas las citas se reservan al guardar.")}</p>
  </fieldset>;
}
