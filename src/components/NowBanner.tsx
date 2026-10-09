"use client";
import { displayTime } from "@/lib/locale";
import { useI18n } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@prisma/client";
export function NowBanner({ events, timezone, now: initial }: { events: Event[]; timezone: string; now: Date }) {
  const { t, preferences } = useI18n();
  const [now, setNow] = useState(initial); const router = useRouter();
  useEffect(() => { const id = setInterval(() => { setNow(new Date()); router.refresh(); }, 60_000); return () => clearInterval(id); }, [router]);
  const active = events.filter(e => ["PENDING", "IN_PROGRESS"].includes(e.status));
  const current = active.find(e => e.startsAt <= now && now < e.endsAt);
  const next = active.find(e => e.startsAt > now);
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="relative overflow-hidden rounded-2xl bg-ink px-6 py-5 text-card"><span className="absolute -right-5 -top-9 size-40 rounded-full border border-white/10" /><p className="text-xs uppercase tracking-[.2em] text-card/60"><span className="mr-2 inline-block size-1.5 rounded-full bg-[#a8c3a2]" />{t("Ahora")}</p><p className="mt-2 display text-2xl">{current?.title ?? t("Un momento libre")}</p><p className="mt-1 text-sm text-card/65">{current ? t(`Hasta las ${displayTime(current.endsAt, timezone, preferences)}`) : "Respira. Tu siguiente paso tiene su lugar."}</p></div>
    <div className="rounded-2xl border border-line bg-card px-6 py-5"><p className="text-xs uppercase tracking-[.2em] text-muted">{t("Después")}</p><p className="mt-2 display text-2xl">{next?.title ?? t("Sin más bloques por hoy")}</p><p className="mt-1 text-sm text-muted">{next ? `${displayTime(next.startsAt, timezone, preferences)} – ${displayTime(next.endsAt, timezone, preferences)}` : t("Puedes dejar este tiempo libre.")}</p></div>
  </div>;
}
