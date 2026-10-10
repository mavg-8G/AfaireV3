"use client";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addLocalDays } from "@/lib/time";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";
export function DateNavigator({ date, today, week = false, grid = false }: { date: string; today: string; week?: boolean; grid?: boolean }) {
  const { t } = useI18n();
  const router = useRouter(); const route = (day: string) => week ? `/week?start=${day}` : `/?date=${day}${grid ? "&view=grid" : ""}`;
  const isToday = week ? date <= today && today < addLocalDays(date, 7) : date === today;
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <div className="flex items-center rounded-full border border-line bg-card p-1 shadow-sm">
      <Link aria-label={week ? t("Semana anterior") : t("Día anterior")} href={route(addLocalDays(date, week ? -7 : -1))} className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"><ChevronLeftIcon /></Link>
      <input aria-label={t("Elegir fecha")} type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={event => { if (event.target.value) router.push(route(event.target.value)); }} className="min-h-10 min-w-0 rounded-full border-0 bg-transparent px-2 text-center font-medium tabular-nums text-ink focus:bg-sunken" />
      <Link aria-label={week ? t("Semana siguiente") : t("Día siguiente")} href={route(addLocalDays(date, week ? 7 : 1))} className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"><ChevronRightIcon /></Link>
    </div>
    <Link href={week ? "/week" : grid ? "/?view=grid" : "/"} aria-current={isToday ? "date" : undefined} className={`flex min-h-11 items-center rounded-full px-4 font-semibold transition ${isToday ? "bg-sage-soft text-sage" : "text-sage hover:bg-sage-soft"}`}>{t("Hoy")}</Link>
  </div>;
}
