"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/definitions";
import { LanguagePicker } from "./LocaleProvider";
import { ThemePicker } from "./ThemeProvider";
import { BrandMark } from "./Icons";

export function AuthForm({ mode, inviteOnly = false }: { mode: "login" | "register"; inviteOnly?: boolean }) {
  const { t, preferences } = useI18n();
  const [state, setState] = useState<AuthFormState>({}); const [pending, setPending] = useState(false);
  const register = mode === "register";
  return <main className="topbar mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-12 px-5 py-10 sm:px-6 lg:grid-cols-2 lg:py-12">
    <section className="hidden lg:block"><Link href="/login" className="flex w-fit items-center gap-3 font-display text-3xl font-semibold tracking-tight"><BrandMark className="size-11" />Afaire</Link>
      <p className="eyebrow mt-16">{t("Haz espacio para lo que importa")}</p>
      <h2 className="mt-4 max-w-lg text-6xl font-semibold leading-[1.02] tracking-[-0.035em]">{t("Tu día, con un poco más de calma.")}</h2>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">{t("Fija tus citas, elige tus rutinas y deja que Afaire encuentre un lugar para cada cosa.")}</p>
      <ol aria-label={t("Un día con intención")} className="day-rail mt-10 max-w-sm space-y-3">
        {[["09:00", t("Tu cita, en su lugar"), true], ["10:10", t("Un momento para avanzar"), false], ["12:30", t("Tiempo para una pausa"), false]].map(([time, label, fixed]) => <li key={String(time)} className="relative grid grid-cols-[3.5rem_1fr] gap-x-6 sm:grid-cols-[4.5rem_1fr]"><span className="pt-3.5 text-right text-sm font-semibold tabular-nums">{time}</span><span aria-hidden="true" className={`absolute top-[1.05rem] left-[calc(5.25rem-6px)] size-3 rounded-full border-2 ${fixed ? "border-fixed bg-fixed" : "border-sage bg-card"}`} /><span className={`rounded-2xl border bg-card px-4 py-3 text-sm font-medium shadow-sm ${fixed ? "border-fixed/40" : "border-line"}`}>{label}</span></li>)}
      </ol>
    </section>
    <section className="mx-auto w-full max-w-md rounded-[2rem] border border-line bg-card p-6 shadow-lg sm:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2.5 font-display text-xl font-semibold lg:hidden"><BrandMark className="size-8" />Afaire</span><div className="flex items-center gap-2"><LanguagePicker /><div className="w-32"><ThemePicker compact /></div></div></div>
      <p className="eyebrow">{register ? t("Empieza aquí") : t("Bienvenido de nuevo")}</p>
      <h1 className="mt-2 text-4xl sm:text-[2.75rem]">{register ? t("Crea tu cuenta") : t("Tu agenda te espera")}</h1>
      <p className="mt-3 text-sm text-muted">{register ? t("Tu espacio personal para organizar cada día.") : t("Entra y descubre qué sigue hoy.")}</p>
      <form aria-busy={pending} className="mt-7 space-y-4" onSubmit={async event => {
        event.preventDefault(); setPending(true); setState({});
        const data = new FormData(event.currentTarget);
        try {
          if (register) {
            data.set("locale", preferences.locale);
            data.set("hourFormat", preferences.hourFormat);
            data.set("weekStartsOn", String(preferences.weekStartsOn));
            data.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Guayaquil");
            const result = await signup(data);
            if (!result.ok) { setState(result); return; }
          }
          const result = await signIn("credentials", { email: String(data.get("email")), password: String(data.get("password")), redirect: false });
          if (result?.error || !result?.ok) setState({ message: t("Email o contraseña incorrectos. Si has hecho varios intentos, espera 15 minutos.") });
          else window.location.assign(register ? "/onboarding" : "/");
        } catch { setState({ message: t("No se pudo conectar. Inténtalo de nuevo.") }); }
        finally { setPending(false); }
      }}>
        {register && <label className="block text-sm">{t("Nombre")}<input name="name" aria-invalid={Boolean(state.errors?.name)} aria-describedby={state.errors?.name ? "auth-feedback" : undefined} required autoComplete="name" maxLength={80} className="field" /></label>}
        <label className="block text-sm">Email<input name="email" aria-invalid={Boolean(state.errors?.email)} aria-describedby={state.errors?.email ? "auth-feedback" : undefined} required type="email" autoComplete="email" maxLength={254} className="field" /></label>
        <label className="block text-sm">{t("Contraseña")}<input name="password" aria-invalid={Boolean(state.errors?.password)} aria-describedby={state.errors?.password ? "auth-feedback" : undefined} required type="password" minLength={register ? 10 : 1} maxLength={72} autoComplete={register ? "new-password" : "current-password"} className="field" />{register && <span className="mt-1 block text-xs text-muted">{t("Al menos 10 caracteres.")}</span>}</label>
        {register && inviteOnly && <label className="block text-sm">{t("Código de invitación")}<input name="inviteCode" required type="password" className="field" /></label>}
        {state.errors && <p id="auth-feedback" role="alert" className="text-sm text-terracotta">{Object.values(state.errors).flat().filter(Boolean).map(value => t(value!)).join(" ")}</p>}
        {state.message && <p role="alert" className="text-sm text-terracotta">{t(state.message)}</p>}
        <button disabled={pending} className="btn btn-primary w-full">{pending ? t("Un momento…") : register ? t("Crear mi espacio →") : t("Entrar →")}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{register ? t("¿Ya tienes una cuenta? ") : t("¿Primera vez aquí? ")}<Link href={register ? "/login" : "/register"} className="text-sage underline underline-offset-4">{register ? t("Inicia sesión") : t("Crea tu cuenta")}</Link></p>
    </section>
  </main>;
}
