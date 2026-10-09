"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { planDay } from "@/app/actions/plan";
import { RefreshIcon, SparkIcon } from "./Icons";
export function PlanButton({ date, disabled = false, existing = false }: { date: string; disabled?: boolean; existing?: boolean }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState(false); const router = useRouter();
  return <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
    <button disabled={pending || disabled} aria-busy={pending} className="btn btn-primary min-h-12 px-6 text-[15px]" onClick={async () => {
      setPending(true); setMessage("");
      try {
        const result = await planDay(date); setError(Boolean(result.error));
        setMessage(result.error ?? `${result.placed} bloques organizados${result.skipped.length ? t(` · ${result.skipped.length} sin espacio`) : "."}`);
        if (!result.error) router.refresh();
      } catch { setError(true); setMessage(t("No se pudo planificar. Inténtalo de nuevo.")); }
      finally { setPending(false); }
    }}>{existing ? <RefreshIcon className={`size-5 ${pending ? "animate-spin" : ""}`} /> : <SparkIcon className={`size-5 ${pending ? "animate-pulse" : ""}`} />}{pending ? t("Encontrando huecos…") : existing ? t("Replanificar lo pendiente") : t("Organizar mi día")}</button>
    {message && <p role={error ? "alert" : "status"} className={`max-w-md text-sm sm:text-right ${error ? "text-terracotta" : "text-muted"}`}>{t(message)}</p>}
  </div>;
}
