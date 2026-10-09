"use client";
import { displayTime } from "@/lib/locale";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecurrenceFields } from "./RecurrenceFields";
import type { EventSeries } from "../generated/prisma/client";
import type { Event } from "../generated/prisma/client";
import { deleteEvent, lockEvent, toggleEventDone, updateEventTimes, changeEventStatus, deleteFollowingEvents, saveActualMinutes } from "@/app/actions/events";
import { formatTime, ymdInZone } from "@/lib/time";
import { ActionButton } from "./ActionButton";
export function EventCard({ event, timezone }: { event: Event & { series?: EventSeries | null }; timezone: string; date?: string }) {
  const { t, preferences } = useI18n();
  const done = event.status === "DONE"; const skipped = event.status === "SKIPPED";
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const router = useRouter();
  return <article className={`rounded-2xl border border-line border-l-4 bg-card p-4 transition sm:p-5 ${done || skipped ? "border-l-line" : event.locked ? "border-l-terracotta" : "border-l-sage"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-medium tabular-nums">{displayTime(event.startsAt, timezone, preferences)} – {displayTime(event.endsAt, timezone, preferences)}</span><span className="rounded-md bg-paper px-2 py-0.5">{event.locked ? t("Fijo") : t("Flexible")} · {event.source === "HABIT" ? t("Hábito") : event.source === "AUTO" ? t("Tarea") : t("Cita")}</span>{done && <span className="text-sage">{t("Completado ✓")}</span>}{skipped && <span>{t("Omitido")}</span>}{event.status === "IN_PROGRESS" && <span className="text-sage">{t("En curso")}</span>}</p><h3 className={`mt-2 text-lg font-medium ${done ? "line-through" : ""}`}>{event.title}</h3>{event.seriesId && <p className="mt-1 text-xs text-sage">{t("Cita recurrente")}</p>}{event.location && <p className="mt-1 text-xs text-muted">{event.location} {t(" · traslado ")}{event.travelMinutes} min</p>}{event.actualMinutes != null && <p className="mt-1 text-xs text-muted">{event.actualMinutes} {t(" min reales · ")}{event.estimatedMinutes ?? Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60000)} {t(" min estimados")}</p>}{event.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{event.notes}</p>}</div>
      {!skipped && <ActionButton action={toggleEventDone.bind(null, event.id)} className={done ? "" : "bg-sage text-white border-sage"}>{done ? t("Reabrir") : t("Hecho ✓")}</ActionButton>}
    </div>
    {event.chunkIndex != null && <p className="mt-2 text-xs text-sage">{t("Fragmento")} {event.chunkIndex}/{event.chunkCount} · {t("La tarea se completa al terminar todos los fragmentos.")}</p>}
    <details className="mt-3 text-sm"><summary className="text-sage">{t("¿Por qué este bloque está aquí?")}</summary><p className="mt-2 leading-relaxed text-muted">{t(event.planningReason ?? (event.seriesId ? t("Cita generada según tu regla de repetición; conserva el horario de la zona de la serie.") : event.source === "MANUAL" ? t("Cita con el horario elegido por ti. El planificador reserva su tiempo y el traslado.") : t("Este bloque se creó antes de guardar explicaciones. Al volver a organizar el día, los bloques flexibles pendientes tendrán una explicación.")))}</p></details>
    {!skipped && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted hover:text-ink">{t("Opciones del bloque")}</summary>
      <div className="my-3 flex flex-wrap gap-2">
        {!event.locked && <ActionButton action={lockEvent.bind(null, event.id)}>{t("Fijar horario")}</ActionButton>}
        {!done && event.status === "PENDING" && <ActionButton action={changeEventStatus.bind(null, event.id, "IN_PROGRESS")}>{t("Empezar")}</ActionButton>}
        {!done && <ActionButton action={changeEventStatus.bind(null, event.id, "SKIPPED")}>{t("Omitir hoy")}</ActionButton>}
        {event.seriesId && <ActionButton action={deleteFollowingEvents.bind(null, event.id)} confirm={t("¿Quitar esta cita y las siguientes pendientes? Se conserva el historial.")} className="text-terracotta">{t("Quitar esta y siguientes")}</ActionButton>}
        <ActionButton action={deleteEvent.bind(null, event.id)} confirm={t("¿Quitar este bloque de la agenda? Se conservará su historial.")} className="text-terracotta">{t("Quitar")}</ActionButton>
      </div>
      <form aria-busy={pending} className="grid grid-cols-2 gap-3" onSubmit={async e => {
        e.preventDefault(); setPending(true); setError("");
        try { const result = await updateEventTimes(event.id, new FormData(e.currentTarget)); if (result.error) setError(result.error); else router.refresh(); }
        catch { setError(t("No se pudo cambiar el horario.")); } finally { setPending(false); }
      }}>
        <label className="col-span-2">{t("Título")}<input name="title" required defaultValue={event.title} className="field" /></label>
        <label>{t("Fecha inicial")}<input name="date" type="date" required defaultValue={ymdInZone(event.startsAt, timezone)} className="field" /></label>
        <label>{t("Fecha final")}<input name="endDate" type="date" required defaultValue={ymdInZone(event.endsAt, timezone)} className="field" /></label>
        <label>{t("Inicio")}<input name="startTime" type="time" required defaultValue={formatTime(event.startsAt, timezone)} className="field" /></label>
        <label>{t("Fin")}<input name="endTime" type="time" required defaultValue={formatTime(event.endsAt, timezone)} className="field" /></label>
        <label className="col-span-2">{t("Ubicación")}<input name="location" maxLength={200} defaultValue={event.location ?? ""} className="field" /></label><label className="col-span-2">{t("Traslado antes de llegar · minutos")}<input name="travelMinutes" type="number" min={0} max={180} defaultValue={event.travelMinutes} className="field" /></label>
        {event.series && <><label className="col-span-2">{t("Aplicar cambios a")}<select name="scope" defaultValue="THIS" className="field"><option value="THIS">{t("Solo esta")}</option><option value="FOLLOWING">{t("Esta y las siguientes")}</option></select></label><div className="col-span-2"><RecurrenceFields date={ymdInZone(event.startsAt, timezone)} frequency={event.series.frequency} weekdays={event.series.weekdays} until={event.series.until.toISOString().slice(0, 10)} /></div></>}
        <label className="col-span-2">{t("Notas")}<textarea name="notes" rows={2} maxLength={2000} defaultValue={event.notes ?? ""} className="field" /></label>
        <p className="col-span-2 text-xs text-muted">{t("Al moverlo manualmente, el bloque queda fijo.")}</p>
        {error && <p role="alert" className="col-span-2 text-terracotta">{t(error)}</p>}
        <button disabled={pending} className="col-span-2 rounded-full bg-ink px-3 py-2 text-card">{pending ? t("Guardando…") : t("Guardar horario")}</button>
      </form>
      {done && <form aria-busy={pending} className="mt-4 flex flex-wrap items-end gap-2" onSubmit={async e => { e.preventDefault(); setPending(true); setError(""); try { const result = await saveActualMinutes(event.id, new FormData(e.currentTarget)); if (result.error) setError(result.error); else router.refresh(); } catch { setError(t("No se pudo guardar el tiempo real.")); } finally { setPending(false); } }}><label>{t("Minutos reales")}<input name="actualMinutes" type="number" required min={1} max={480} defaultValue={event.actualMinutes ?? undefined} className="field max-w-32" /></label><button disabled={pending} className="rounded-full border border-line px-3 py-2">{t("Guardar tiempo real")}</button></form>}
    </details>}
  </article>;
}
