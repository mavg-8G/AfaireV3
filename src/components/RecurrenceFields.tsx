import { WEEKDAY_LABELS } from "@/lib/definitions";
import { addLocalDays } from "@/lib/time";
export function RecurrenceFields({ date, frequency = "NONE", until, weekdays = [] }: { date: string; frequency?: string; until?: string; weekdays?: number[] }) {
  return <fieldset className="space-y-3 rounded-xl border border-line p-3"><legend className="px-1 text-sm">Repetición</legend>
    <label className="block text-sm">Frecuencia<select name="frequency" defaultValue={frequency} className="field"><option value="NONE">No se repite</option><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal por días</option><option value="MONTHLY">Mensual · mismo día del mes</option></select></label>
    <div className="flex flex-wrap gap-2">{WEEKDAY_LABELS.map((label, i) => <label key={i} className="text-xs"><input type="checkbox" name="weekdays" value={i} defaultChecked={weekdays.includes(i)} /> {label}</label>)}</div>
    <p className="text-xs text-muted">Los días se usan en la repetición semanal. La mensual omite meses que no tengan ese día.</p>
    <label className="block text-sm">Última fecha de repetición<input name="until" type="date" defaultValue={until ?? addLocalDays(date, 90)} className="field" /></label>
    <p className="text-xs text-muted">Hasta 366 días desde el inicio. Todas las citas se reservan al guardar.</p>
  </fieldset>;
}
