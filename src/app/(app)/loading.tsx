"use client";
import { useI18n } from "@/components/LocaleProvider";
// A client fallback with no data access: it is prefetched with the layout and shows the moment a tab is tapped.
export default function Loading() {
  const { t } = useI18n();
  return <div role="status" aria-live="polite" className="space-y-6">
    <span className="sr-only">{t("Abriendo tu agenda…")}</span>
    <div className="space-y-3"><div className="h-4 w-28 animate-pulse rounded-full bg-line/70" /><div className="h-12 w-3/4 max-w-md animate-pulse rounded-2xl bg-line/70" /><div className="h-4 w-56 animate-pulse rounded-full bg-line/50" /></div>
    <div className="h-28 animate-pulse rounded-3xl bg-line/45" />
    <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-6 sm:grid-cols-[4.5rem_1fr]"><div className="ml-auto mt-4 h-4 w-10 animate-pulse rounded-full bg-line/60" /><div className="h-24 animate-pulse rounded-2xl bg-line/40" /></div>)}</div>
  </div>;
}
