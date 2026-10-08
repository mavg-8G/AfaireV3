"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecurrenceFields } from "./RecurrenceFields";
import type { EventSeries } from "@prisma/client";
import type { Event } from "@prisma/client";
import { deleteEvent, lockEvent, toggleEventDone, updateEventTimes, changeEventStatus, deleteFollowingEvents, saveActualMinutes } from "@/app/actions/events";
import { formatTime, ymdInZone } from "@/lib/time";
import { ActionButton } from "./ActionButton";
export function EventCard({ event, timezone }: { event: Event & { series?: EventSeries | null }; timezone: string; date?: string }) {
  const done = event.status === "DONE"; const skipped = event.status === "SKIPPED";
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const router = useRouter();
  return <article className={`rounded-2xl border border-line border-l-4 bg-card p-4 transition sm:p-5 ${done || skipped ? "border-l-line opacity-65" : event.locked ? "border-l-terracotta" : "border-l-sage"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-medium tabular-nums">{formatTime(event.startsAt, timezone)} – {formatTime(event.endsAt, timezone)}</span><span className="rounded-md bg-paper px-2 py-0.5">{event.locked ? "Fijo" : "Flexible"} · {event.source === "HABIT" ? "Hábito" : event.source === "AUTO" ? "Tarea" : "Cita"}</span>{done && <span className="text-sage">Completado ✓</span>}{skipped && <span>Omitido</span>}{event.status === "IN_PROGRESS" && <span className="text-sage">En curso</span>}</p><h3 className={`mt-2 text-lg font-medium ${done ? "line-through" : ""}`}>{event.title}</h3>{event.seriesId && <p className="mt-1 text-xs text-sage">Cita recurrente</p>}{event.location && <p className="mt-1 text-xs text-muted">{event.location} · traslado {event.travelMinutes} min</p>}{event.actualMinutes != null && <p className="mt-1 text-xs text-muted">{event.actualMinutes} min reales · {event.estimatedMinutes ?? Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60000)} min estimados</p>}{event.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{event.notes}</p>}</div>
      {!skipped && <ActionButton action={toggleEventDone.bind(null, event.id)} className={done ? "" : "bg-sage text-white border-sage"}>{done ? "Reabrir" : "Hecho ✓"}</ActionButton>}
    </div>
    {!skipped && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted hover:text-ink">Opciones del bloque</summary>
      <div className="my-3 flex flex-wrap gap-2">
        {!event.locked && <ActionButton action={lockEvent.bind(null, event.id)}>Fijar horario</ActionButton>}
        {!done && event.status === "PENDING" && <ActionButton action={changeEventStatus.bind(null, event.id, "IN_PROGRESS")}>Empezar</ActionButton>}
        {!done && <ActionButton action={changeEventStatus.bind(null, event.id, "SKIPPED")}>Omitir hoy</ActionButton>}
        {event.seriesId && <ActionButton action={deleteFollowingEvents.bind(null, event.id)} confirm="¿Quitar esta cita y las siguientes pendientes? Se conserva el historial." className="text-terracotta">Quitar esta y siguientes</ActionButton>}
        <ActionButton action={deleteEvent.bind(null, event.id)} confirm="¿Quitar este bloque de la agenda? Se conservará su historial." className="text-terracotta">Quitar</ActionButton>
      </div>
      <form className="grid grid-cols-2 gap-3" onSubmit={async e => {
        e.preventDefault(); setPending(true); setError("");
        try { const result = await updateEventTimes(event.id, new FormData(e.currentTarget)); if (result.error) setError(result.error); else router.refresh(); }
        catch { setError("No se pudo cambiar el horario."); } finally { setPending(false); }
      }}>
        <label className="col-span-2">Título<input name="title" required defaultValue={event.title} className="field" /></label>
        <label>Fecha inicial<input name="date" type="date" required defaultValue={ymdInZone(event.startsAt, timezone)} className="field" /></label>
        <label>Fecha final<input name="endDate" type="date" required defaultValue={ymdInZone(event.endsAt, timezone)} className="field" /></label>
        <label>Inicio<input name="startTime" type="time" required defaultValue={formatTime(event.startsAt, timezone)} className="field" /></label>
        <label>Fin<input name="endTime" type="time" required defaultValue={formatTime(event.endsAt, timezone)} className="field" /></label>
        <label className="col-span-2">Ubicación<input name="location" maxLength={200} defaultValue={event.location ?? ""} className="field" /></label><label className="col-span-2">Traslado antes de llegar · minutos<input name="travelMinutes" type="number" min={0} max={180} defaultValue={event.travelMinutes} className="field" /></label>
        {event.series && <><label className="col-span-2">Aplicar cambios a<select name="scope" defaultValue="THIS" className="field"><option value="THIS">Solo esta</option><option value="FOLLOWING">Esta y las siguientes</option></select></label><div className="col-span-2"><RecurrenceFields date={ymdInZone(event.startsAt, timezone)} frequency={event.series.frequency} weekdays={event.series.weekdays} until={event.series.until.toISOString().slice(0, 10)} /></div></>}
        <label className="col-span-2">Notas<textarea name="notes" rows={2} maxLength={2000} defaultValue={event.notes ?? ""} className="field" /></label>
        <p className="col-span-2 text-xs text-muted">Al moverlo manualmente, el bloque queda fijo.</p>
        {error && <p role="alert" className="col-span-2 text-terracotta">{error}</p>}
        <button disabled={pending} className="col-span-2 rounded-full bg-ink px-3 py-2 text-card">{pending ? "Guardando…" : "Guardar horario"}</button>
      </form>
      {done && <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={async e => { e.preventDefault(); setPending(true); setError(""); try { const result = await saveActualMinutes(event.id, new FormData(e.currentTarget)); if (result.error) setError(result.error); else router.refresh(); } catch { setError("No se pudo guardar el tiempo real."); } finally { setPending(false); } }}><label>Minutos reales<input name="actualMinutes" type="number" required min={1} max={480} defaultValue={event.actualMinutes ?? undefined} className="field max-w-32" /></label><button disabled={pending} className="rounded-full border border-line px-3 py-2">Guardar tiempo real</button></form>}
    </details>}
  </article>;
}
