"use client";
import { displayTime } from "@/lib/locale";
import { useI18n } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "../generated/prisma/client";
export function NowBanner({ events, timezone, now: initial }: { events: Event[]; timezone: string; now: Date }) {
  const { t, preferences } = useI18n();
  const [now, setNow] = useState(initial); const router = useRouter();
  useEffect(() => { const id = setInterval(() => { setNow(new Date()); router.refresh(); }, 60_000); return () => clearInterval(id); }, [router]);
  const active = events.filter(e => ["PENDING", "IN_PROGRESS"].includes(e.status));
  const current = active.find(e => e.startsAt <= now && now < e.endsAt);
  const next = active.find(e => e.startsAt > now);
  const progress = current ? Math.min(100, Math.max(0, Math.round(((now.getTime() - current.startsAt.getTime()) / (current.endsAt.getTime() - current.startsAt.getTime())) * 20) * 5)) : 0;
  const width = ["w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-1/4", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]", "w-1/2", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-3/4", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full"][progress / 5];
  return <div className="grid overflow-hidden rounded-3xl border border-line bg-card shadow-sm sm:grid-cols-[1.4fr_1fr]">
    <div className="relative bg-hero px-6 py-5 text-on-hero">
      <p className="flex items-center gap-2 text-sm font-semibold opacity-85"><span className="live-dot inline-block size-2 rounded-full bg-current" />{t("Ahora")}</p>
      <p className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-[1.75rem]">{current?.title ?? t("Un momento libre")}</p>
      <p className="mt-1 text-sm opacity-80">{current ? t(`Hasta las ${displayTime(current.endsAt, timezone, preferences)}`) : t("Respira. Tu siguiente paso tiene su lugar.")}</p>
      {current && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-on-hero/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("Progreso del bloque actual")}><div className={`h-full rounded-full bg-on-hero ${width}`} /></div>}
    </div>
    <div className="border-t border-line px-6 py-5 sm:border-l sm:border-t-0">
      <p className="text-sm font-semibold text-muted">{t("Después")}</p>
      <p className="mt-2 font-display text-xl font-semibold leading-tight">{next?.title ?? t("Sin más bloques por hoy")}</p>
      <p className="mt-1 text-sm tabular-nums text-muted">{next ? `${displayTime(next.startsAt, timezone, preferences)} – ${displayTime(next.endsAt, timezone, preferences)}` : t("Puedes dejar este tiempo libre.")}</p>
    </div>
  </div>;
}
