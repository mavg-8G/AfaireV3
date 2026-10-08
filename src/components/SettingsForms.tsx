"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Availability } from "@prisma/client";
import { changePassword } from "@/app/actions/auth";
import { updateSettings, resetLearning } from "@/app/actions/settings";
import { COMMON_TIMEZONES, WEEKDAY_LABELS, type AuthFormState } from "@/lib/definitions";
import { HABIT_TEMPLATES } from "@/lib/templates";
import { availabilitySummary } from "@/lib/availability";
import { ActionButton } from "./ActionButton";
type Profile = { name: string; timezone: string; dayStart: string; dayEnd: string; bufferMinutes: number; autoPlan: boolean; carryOver: boolean; adaptiveAvailability: boolean; adaptiveDurations: boolean; focusWindow: string; availability: Availability[] };
export function SettingsForms({ profile, onboarding = false }: { profile: Profile; onboarding?: boolean }) {
  const [message, setMessage] = useState(""); const [error, setError] = useState(false); const [pending, setPending] = useState(false);
  const [pwdState, pwdAction, pwdPending] = useActionState(changePassword, {} as AuthFormState); const router = useRouter();
  return <div className={`grid grid-cols-1 gap-6 ${onboarding ? "mx-auto max-w-3xl" : "lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
    <form className="min-w-0 space-y-6 rounded-3xl border border-line bg-card p-5 sm:p-8" onSubmit={async event => {
      event.preventDefault(); setPending(true); setMessage("");
      try { const result = await updateSettings(new FormData(event.currentTarget)); setError(Boolean(result.error)); setMessage(result.error ?? "Ajustes guardados."); if (!result.error) { if (onboarding) router.push("/"); router.refresh(); } }
      catch { setError(true); setMessage("No se pudo guardar. Inténtalo de nuevo."); } finally { setPending(false); }
    }}>
      <div><p className="text-xs uppercase tracking-widest text-sage">{onboarding ? "Tu espacio, a tu ritmo" : "Preferencias"}</p><h1 className="mt-3 text-4xl">{onboarding ? "Dale forma a tu día" : "Ajustes"}</h1><p className="mt-3 text-sm leading-relaxed text-muted">Define cuándo tienes tiempo. Afaire organiza tus actividades dentro de ese horario.</p></div>
      <input type="hidden" name="dayStart" value={profile.dayStart} /><input type="hidden" name="dayEnd" value={profile.dayEnd} />{onboarding && <input type="hidden" name="onboarding" value="true" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Nombre<input name="name" required defaultValue={profile.name} maxLength={80} className="field" /></label>
        <label className="text-sm">Zona horaria<input name="timezone" required defaultValue={profile.timezone} list="timezones" className="field" /><datalist id="timezones">{[...new Set([...COMMON_TIMEZONES, profile.timezone])].map(tz => <option key={tz} value={tz} />)}</datalist></label>
      </div>
      <fieldset className="min-w-0"><legend className="font-medium">Horarios iniciales</legend><p className="mt-1 text-xs text-muted">Son el punto de partida. Con el aprendizaje activo, se ajustan según tus patrones de uso.</p>
        <div className="mt-4 space-y-2">{WEEKDAY_LABELS.map((label, weekday) => {
          const row = profile.availability.find(item => item.weekday === weekday);
          return <div key={weekday} className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-xl bg-paper/60 px-2 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3 sm:px-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`active-${weekday}`} defaultChecked={row?.active ?? true} />{label}</label>
            <label className="text-xs text-muted">Desde<input aria-label={`Inicio ${label}`} name={`start-${weekday}`} type="time" required defaultValue={row?.start ?? profile.dayStart} className="field !mt-1 !py-1.5" /></label>
            <label className="text-xs text-muted">Hasta<input aria-label={`Fin ${label}`} name={`end-${weekday}`} type="time" required defaultValue={row?.end ?? profile.dayEnd} className="field !mt-1 !py-1.5" /></label>
            {row?.learningReason && <p className="col-span-3 pb-1 text-xs leading-relaxed text-sage">{profile.adaptiveAvailability ? `Aprendido: ${availabilitySummary(profile, weekday)}` : "Aprendizaje en pausa"}<span className="mt-1 block text-muted">{row.learningReason}</span></p>}
          </div>;
        })}</div>
      </fieldset>
      <label className="block text-sm">Mi franja de mayor foco<select name="focusWindow" defaultValue={profile.focusWindow} className="field"><option value="MORNING">Mañana · 06–12</option><option value="AFTERNOON">Tarde · 12–18</option><option value="EVENING">Noche · 18–24</option><option value="LEARNED">Aprender del uso · mañana hasta tener datos</option></select><span className="mt-1 block text-xs text-muted">Las tareas profundas sin una preferencia propia se colocan primero aquí. El uso de la app es una aproximación a tus horas de foco.</span></label><label className="flex items-start gap-3 text-sm"><input name="adaptiveDurations" type="checkbox" defaultChecked={profile.adaptiveDurations} /><span>Ajustar duraciones con los tiempos reales<span className="mt-1 block text-xs text-muted">Desde tres mediciones del mismo hábito o tareas con el mismo título; ajuste máximo del 25 % por plan. Registra el tiempo al completar un bloque.</span></span></label><label className="block text-sm">Descanso mínimo entre bloques · minutos<input name="bufferMinutes" type="number" required min={0} max={60} defaultValue={profile.bufferMinutes} className="field max-w-28" /></label>
      <label className="flex items-start gap-3 rounded-xl border border-sage/30 bg-sage/5 p-4 text-sm"><input className="mt-1" name="adaptiveAvailability" type="checkbox" defaultChecked={profile.adaptiveAvailability} /><span><strong className="block font-medium">Aprender mi disponibilidad con el uso</strong><span className="mt-1 block text-xs leading-relaxed text-muted">Afaire observa cuándo abres o utilizas la agenda, incluida la madrugada. Las franjas repetidas en tres fechas distintas ayudan a ajustar el horario. Afinar o desactivar días requiere al menos tres semanas de uso frecuente. Se guardan solo fecha y franja horaria durante 28 días.</span></span></label>
      <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm"><input className="mt-1" name="autoPlan" type="checkbox" defaultChecked={profile.autoPlan} /><span><strong className="block font-medium">Organizar mi día automáticamente</strong><span className="mt-1 block text-xs leading-relaxed text-muted">El plan se genera al empezar tu horario, aunque no abras la web. Un plan existente se conserva.</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input name="carryOver" type="checkbox" defaultChecked={profile.carryOver} /><span>Recuperar tareas flexibles pendientes de días anteriores<span className="mt-1 block text-xs text-muted">Las citas fijas y los hábitos de ayer no se trasladan.</span></span></label>
      {onboarding && <fieldset><legend className="font-medium">Empieza con algunas rutinas</legend><p className="mt-1 text-xs text-muted">Opcionales. Puedes editarlas y añadir otras después.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{HABIT_TEMPLATES.map(template => <label key={template.key} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm"><input type="checkbox" name="templates" value={template.key} /><span>{template.title}<span className="block text-xs text-muted">{template.durationMinutes} min · {template.required ? "Esencial" : "Opcional"}</span></span></label>)}</div></fieldset>}
      {message && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-terracotta" : "text-sage"}`}>{message}</p>}
      <button disabled={pending} className="rounded-full bg-sage px-6 py-3 text-sm text-white">{pending ? "Guardando…" : onboarding ? "Abrir mi agenda →" : "Guardar preferencias"}</button>
    </form>
    {!onboarding && <aside className="space-y-5"><form action={pwdAction} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="text-2xl">Contraseña</h2><label className="block text-sm">Actual<input name="currentPassword" type="password" required autoComplete="current-password" className="field" /></label><label className="block text-sm">Nueva<input name="newPassword" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className="field" /></label>
      {pwdState.message && <p role="status" className="text-sm">{pwdState.message}</p>}{pwdState.errors && <p role="alert" className="text-sm text-terracotta">{Object.values(pwdState.errors).flat().join(" ")}</p>}
      {pwdState.ok ? <Link href="/login" className="text-sm text-sage underline">Volver a iniciar sesión</Link> : <button disabled={pwdPending} className="rounded-full border border-line px-4 py-2 text-sm">{pwdPending ? "Guardando…" : "Cambiar contraseña"}</button>}
    </form><div className="space-y-4 rounded-2xl bg-sage/10 p-5 text-sm leading-relaxed text-sage"><p>Los horarios aprendidos se aplican a los próximos planes. Tus citas y planes existentes mantienen su lugar.</p><ActionButton action={resetLearning} confirm="¿Reiniciar lo aprendido y volver a tus horarios iniciales?">Reiniciar aprendizaje</ActionButton></div></aside>}
  </div>;
}
