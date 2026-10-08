import { addLocalDays, combineLocalDateTime, dateOnly, weekdayForDate } from "./time";

export type RecurrenceRule = {
  startDate: string; until: string; frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  weekdays: number[]; startTime: string; endTime: string; endDayOffset: number; timezone: string;
};
export function recurrenceDates(rule: RecurrenceRule) {
  const span = (dateOnly(rule.until).getTime() - dateOnly(rule.startDate).getTime()) / 86400_000;
  if (span < 0 || span > 366) throw new Error("La repetición debe terminar dentro de los próximos 366 días desde su inicio.");
  if (rule.frequency === "WEEKLY" && !rule.weekdays.length) throw new Error("Selecciona al menos un día de la semana.");
  const days: string[] = [];
  for (let i = 0; i <= span; i++) {
    const day = addLocalDays(rule.startDate, i);
    if (rule.frequency === "DAILY" || (rule.frequency === "WEEKLY" && rule.weekdays.includes(weekdayForDate(day))) || (rule.frequency === "MONTHLY" && day.slice(-2) === rule.startDate.slice(-2))) days.push(day);
  }
  return days;
}
export function recurrenceInstances(rule: RecurrenceRule) {
  return recurrenceDates(rule).map(day => { try { return ({
    recurrenceDate: dateOnly(day), planningDate: dateOnly(day),
    startsAt: combineLocalDateTime(day, rule.startTime, rule.timezone),
    endsAt: combineLocalDateTime(addLocalDays(day, rule.endDayOffset), rule.endTime, rule.timezone),
  }); } catch (error) { throw new Error(`La repetición del ${day}: ${error instanceof Error ? error.message : "Horario inválido."}`); } });
}
