"use client";
import { useI18n } from "./LocaleProvider";
import { orderedWeekdays, weekdayLabel } from "@/lib/locale";
import { addLocalDays } from "@/lib/time";
export function RecurrenceFields({ date, frequency = "NONE", until, weekdays = [] }: { date: string; frequency?: string; until?: string; weekdays?: number[] }) {
  const { preferences, t } = useI18n();
  return <fieldset className="space-y-3 rounded-xl border border-line p-3"><legend className="px-1 text-sm">{t("Repetición")}</legend>
    <label className="block text-sm">{t("Frecuencia")}<select name="frequency" defaultValue={frequency} className="field"><option value="NONE">{t("No se repite")}</option><option value="DAILY">{t("Diaria")}</option><option value="WEEKLY">{t("Semanal por días")}</option><option value="MONTHLY">{t("Mensual · mismo día del mes")}</option></select></label>
    <div className="flex flex-wrap gap-2">{orderedWeekdays(preferences.weekStartsOn).map(i => <label key={i} className="text-xs"><input type="checkbox" name="weekdays" value={i} defaultChecked={weekdays.includes(i)} /> {weekdayLabel(i, preferences.locale)}</label>)}</div>
    <p className="text-xs text-muted">{t("Los días se usan en la repetición semanal. La mensual omite meses que no tengan ese día.")}</p>
    <label className="block text-sm">{t("Última fecha de repetición")}<input name="until" type="date" defaultValue={until ?? addLocalDays(date, 90)} className="field" /></label>
    <p className="text-xs text-muted">{t("Hasta 366 días desde el inicio. Todas las citas se reservan al guardar.")}</p>
  </fieldset>;
}
