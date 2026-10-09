"use client";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addLocalDays } from "@/lib/time";
export function DateNavigator({ date, today, week = false }: { date: string; today: string; week?: boolean }) {
  const { t } = useI18n();
  const router = useRouter(); const route = (day: string) => week ? `/week?start=${day}` : `/?date=${day}`;
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <Link aria-label={week ? t("Semana anterior") : t("Día anterior")} href={route(addLocalDays(date, week ? -7 : -1))} className="rounded-full border border-line bg-card px-3 py-2">←</Link>
    <input aria-label={t("Elegir fecha")} type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={event => { if (event.target.value) router.push(route(event.target.value)); }} className="rounded-full border border-line bg-card px-3 py-2" />
    <Link aria-label={week ? t("Semana siguiente") : t("Día siguiente")} href={route(addLocalDays(date, week ? 7 : 1))} className="rounded-full border border-line bg-card px-3 py-2">→</Link>
    <Link href={week ? "/week" : "/"} className="px-2 text-sage">{t("Hoy")}{date === today ? " •" : ""}</Link>
  </div>;
}
