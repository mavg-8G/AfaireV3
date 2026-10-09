"use client";
import { useI18n } from "@/components/LocaleProvider";
import { RecurrenceFields } from "./RecurrenceFields";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLockedEvent } from "@/app/actions/events";
export function EventForm({ date }: { date: string }) {
  const { t } = useI18n();
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const router = useRouter();
  return <form aria-busy={pending} className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setError("");
    try { const result = await createLockedEvent(new FormData(form)); if (result.error) setError(result.error); else { form.reset(); router.refresh(); } }
    catch { setError(t("No se pudo guardar la cita.")); } finally { setPending(false); }
  }}>
    <h2 className="text-xl">{t("Reserva un momento")}</h2><p className="-mt-2 text-xs leading-relaxed text-muted">{t("Las citas fijas conservan su lugar cuando organizas el día.")}</p>
    <label className="text-sm">{t("Título")}<input name="title" required maxLength={160} placeholder={t("Ej. reunión con el equipo")} className="field" /></label>
    <label className="text-sm">{t("Fecha inicial")}<input name="date" type="date" required defaultValue={date} className="field" /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{t("Inicio")}<input name="startTime" type="time" required defaultValue="09:00" className="field" /></label><label className="text-sm">{t("Fin")}<input name="endTime" type="time" required defaultValue="10:00" className="field" /></label></div>
    <RecurrenceFields date={date} /><label className="text-sm">{t("Ubicación · opcional")}<input name="location" maxLength={200} className="field" /></label><label className="text-sm">{t("Traslado antes de llegar · minutos")}<input name="travelMinutes" type="number" min={0} max={180} defaultValue={0} className="field" /></label><details className="text-sm"><summary className="cursor-pointer text-muted">{t("Más opciones")}</summary><label className="mt-3 block">{t("Fecha final · para citas nocturnas")}<input type="date" name="endDate" className="field" /></label><label className="mt-3 block">{t("Notas")}<textarea name="notes" maxLength={2000} rows={2} className="field" /></label></details>
    {error && <p role="alert" className="text-sm text-terracotta">{t(error)}</p>}
    <button disabled={pending} className="rounded-full bg-ink px-4 py-2.5 text-card">{pending ? t("Guardando…") : t("Añadir cita fija +")}</button>
  </form>;
}
