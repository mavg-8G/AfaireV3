"use client";
import { displayTime } from "@/lib/locale";
import { useI18n } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { changeEventStatus, toggleEventDone } from "@/app/actions/events";
import type { Event } from "../generated/prisma/client";
export function NowBanner({ events, timezone, now: initial }: { events: Event[]; timezone: string; now: Date }) {
  const { t, preferences } = useI18n();
  const [now, setNow] = useState(initial); const router = useRouter();
  useEffect(() => { const id = setInterval(() => { setNow(new Date()); router.refresh(); }, 60_000); return () => clearInterval(id); }, [router]);
  const active = events.filter(e => ["PENDING", "IN_PROGRESS"].includes(e.status));
  const current = active.find(e => e.startsAt <= now && now < e.endsAt);
  const next = active.find(e => e.startsAt > now);
  const progress = current ? Math.min(100, Math.max(0, Math.round(((now.getTime() - current.startsAt.getTime()) / (current.endsAt.getTime() - current.startsAt.getTime())) * 20) * 5)) : 0;
  const remaining = current ? Math.max(0, Math.ceil((current.endsAt.getTime() - now.getTime()) / 60_000)) : 0;
  return <div className="grid overflow-hidden rounded-3xl border border-line bg-card shadow-md sm:grid-cols-[1.4fr_1fr]">
    <div className="relative flex items-center justify-between gap-4 bg-linear-to-br from-hero to-hero-end px-6 py-5 text-on-hero">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold opacity-85"><span className="live-dot inline-block size-2 rounded-full bg-current" />{t("Ahora")}</p>
        <p className="mt-2 font-display text-2xl font-bold leading-tight sm:text-[1.75rem]">{current?.title ?? t("Un momento libre")}</p>
        <p className="mt-1 text-sm opacity-80">{current ? t(`Hasta las ${displayTime(current.endsAt, timezone, preferences)}`) : t("Respira. Tu siguiente paso tiene su lugar.")}</p>
        {current && <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton action={toggleEventDone.bind(null, current.id, false)} className="border-transparent bg-on-hero text-hero hover:bg-on-hero/90">{t("Hecho ✓")}</ActionButton>
          <ActionButton action={changeEventStatus.bind(null, current.id, "SKIPPED")} className="border-on-hero/60 bg-transparent text-on-hero hover:border-on-hero hover:bg-on-hero/10">{t("Omitir hoy")}</ActionButton>
        </div>}
      </div>
      {current && <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("Progreso del bloque actual")} className="relative size-28 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90"><circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-on-hero/25" /><circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray="314.16" strokeDashoffset={314.16 * (1 - progress / 100)} className="ring-fill stroke-on-hero transition-[stroke-dashoffset] duration-700 ease-(--ease-out)" /></svg>
        <span className="absolute inset-0 grid place-content-center text-center font-display text-2xl font-bold leading-none tabular-nums">{remaining}<small className="mt-0.5 block text-[10px] font-medium opacity-80">{t("min")}</small></span>
      </div>}
    </div>
    <div className="border-t border-line px-6 py-5 sm:border-l sm:border-t-0">
      <p className="text-sm font-semibold text-muted">{t("Después")}</p>
      <p className="mt-2 font-display text-xl font-semibold leading-tight">{next?.title ?? t("Sin más bloques por hoy")}</p>
      <p className="mt-1 text-sm tabular-nums text-muted">{next ? `${displayTime(next.startsAt, timezone, preferences)} – ${displayTime(next.endsAt, timezone, preferences)}` : t("Puedes dejar este tiempo libre.")}</p>
    </div>
  </div>;
}
