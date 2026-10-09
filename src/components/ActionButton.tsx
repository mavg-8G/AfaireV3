"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/definitions";

export function ActionButton({ action, children, confirm, className = "" }: { action: () => Promise<ActionResult>; children: React.ReactNode; confirm?: string; className?: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const router = useRouter();
  return <div className="inline-flex flex-col items-start">
    <button disabled={pending} className={`rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-sage ${className}`} onClick={async () => {
      if (confirm && !window.confirm(t(confirm))) return;
      setPending(true); setError("");
      try { const result = await action(); if (result.error) setError(result.error); else router.refresh(); }
      catch { setError(t("No se pudo guardar. Inténtalo de nuevo.")); }
      finally { setPending(false); }
    }}>{pending ? t("Guardando…") : children}</button>
    {error && <span role="alert" className="mt-1 max-w-xs text-xs text-terracotta">{t(error)}</span>}
  </div>;
}
