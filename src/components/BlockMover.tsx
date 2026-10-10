"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { moveEvent } from "@/app/actions/events";
import { GRID_STEP, minuteHm, shiftSlot } from "@/lib/time-grid";

/** Quick moves for a pending block without opening the full form: nudge earlier or later, or jump to a time. */
export function BlockMover({ id, date, minute }: { id: string; date: string; minute: number }) {
  const { t } = useI18n(); const router = useRouter();
  const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function move(target: { date: string; time: string }) {
    setError("");
    startTransition(async () => {
      let message = "";
      try { message = (await moveEvent(id, target.date, target.time)).error ?? ""; } catch { message = "No se pudo cambiar el horario."; }
      startTransition(() => { if (message) setError(message); else router.refresh(); });
    });
  }
  return <div role="group" aria-label={t("Mover bloque")} aria-busy={pending} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
    <button type="button" disabled={pending} className="btn min-h-10 px-3.5" onClick={() => move(shiftSlot(date, minute, -GRID_STEP))}><span aria-hidden="true">↑</span>{t("15 min antes")}</button>
    <button type="button" disabled={pending} className="btn min-h-10 px-3.5" onClick={() => move(shiftSlot(date, minute, GRID_STEP))}><span aria-hidden="true">↓</span>{t("15 min después")}</button>
    <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); move({ date, time: String(new FormData(event.currentTarget).get("startTime")) }); }}>
      <input key={minute} aria-label={t("Nueva hora de inicio")} name="startTime" type="time" required defaultValue={minuteHm(minute)} className="field mt-0 min-h-10 w-auto py-1.5" />
      <button disabled={pending} className="btn min-h-10 px-3.5">{t("Mover a esta hora")}</button>
    </form>
    {error && <p role="alert" className="w-full text-xs text-terracotta">{t(error)}</p>}
  </div>;
}
