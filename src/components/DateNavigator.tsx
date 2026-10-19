"use client";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addLocalDays, startOfLocalWeek, weekdayForDate } from "@/lib/time";
import { weekdayLabel } from "@/lib/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";
export function DateNavigator({ date, today, week = false, grid = false }: { date: string; today: string; week?: boolean; grid?: boolean }) {
  const { t, preferences } = useI18n();
  const router = useRouter(); const route = (day: string) => week ? `/week?start=${day}` : `/?date=${day}${grid ? "&view=grid" : ""}`;
  const isToday = week ? date <= today && today < addLocalDays(date, 7) : date === today;
  const weekStart = startOfLocalWeek(date, preferences.weekStartsOn);
  return <div className="space-y-4">
    {!week && <nav aria-label={t("Días de la semana")} className="grid grid-cols-7 gap-1 sm:max-w-lg sm:gap-2">
      {Array.from({ length: 7 }, (_, index) => {
        const day = addLocalDays(weekStart, index); const selected = day === date;
        return <Link key={day} href={route(day)} aria-current={selected ? "date" : undefined} className={`flex min-h-17 flex-col items-center justify-center gap-2 rounded-2xl py-2 text-xs transition-colors ${selected ? "bg-accent text-on-accent" : "text-muted hover:bg-sage-soft"}`}>
          <span className="capitalize">{weekdayLabel(weekdayForDate(day), preferences.locale)}</span><span className={`text-base font-semibold tabular-nums ${selected ? "" : "text-ink"}`}>{Number(day.slice(-2))}</span>
        </Link>;
      })}
    </nav>}
    <div className="flex flex-wrap items-center gap-2 text-sm">
    <div className="flex items-center rounded-full border border-line bg-card p-1 shadow-sm">
      <Link aria-label={week ? t("Semana anterior") : t("Día anterior")} href={route(addLocalDays(date, week ? -7 : -1))} className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"><ChevronLeftIcon /></Link>
      <input aria-label={t("Elegir fecha")} type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={event => { if (event.target.value) router.push(route(event.target.value)); }} className="min-h-10 min-w-0 rounded-full border-0 bg-transparent px-2 text-center font-medium tabular-nums text-ink focus:bg-sunken" />
      <Link aria-label={week ? t("Semana siguiente") : t("Día siguiente")} href={route(addLocalDays(date, week ? 7 : 1))} className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"><ChevronRightIcon /></Link>
    </div>
    <Link href={week ? "/week" : grid ? "/?view=grid" : "/"} aria-current={isToday ? "date" : undefined} className={`flex min-h-11 items-center rounded-full px-4 font-semibold transition ${isToday ? "bg-sage-soft text-sage" : "text-sage hover:bg-sage-soft"}`}>{t("Hoy")}</Link>
    </div>
  </div>;
}
