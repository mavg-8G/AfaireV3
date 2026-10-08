"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { planDay } from "@/app/actions/plan";
export function PlanButton({ date, disabled = false, existing = false }: { date: string; disabled?: boolean; existing?: boolean }) {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState(false); const router = useRouter();
  return <div className="flex flex-col items-start gap-2">
    <button disabled={pending || disabled} className="rounded-full bg-sage px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-ink" onClick={async () => {
      setPending(true); setMessage("");
      try {
        const result = await planDay(date); setError(Boolean(result.error));
        setMessage(result.error ?? `${result.placed} bloques organizados${result.skipped.length ? ` · ${result.skipped.length} sin espacio` : "."}`);
        if (!result.error) router.refresh();
      } catch { setError(true); setMessage("No se pudo planificar. Inténtalo de nuevo."); }
      finally { setPending(false); }
    }}>{pending ? "Encontrando huecos…" : existing ? "Replanificar lo pendiente ↻" : "Organizar mi día ✦"}</button>
    {message && <p role={error ? "alert" : "status"} className={`max-w-md text-sm ${error ? "text-terracotta" : "text-muted"}`}>{message}</p>}
  </div>;
}
