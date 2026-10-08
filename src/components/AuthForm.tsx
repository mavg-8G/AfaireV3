"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/definitions";
import { ThemePicker } from "./ThemeProvider";

export function AuthForm({ mode, inviteOnly = false }: { mode: "login" | "register"; inviteOnly?: boolean }) {
  const [state, setState] = useState<AuthFormState>({}); const [pending, setPending] = useState(false);
  const register = mode === "register";
  return <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
    <section className="hidden lg:block"><Link href="/login" className="display text-3xl">Afaire<span className="text-sage">.</span></Link>
      <p className="mt-16 text-xs uppercase tracking-[.25em] text-sage">Haz espacio para lo que importa</p>
      <h1 className="mt-5 max-w-lg text-6xl leading-[1.08]">Tu día, con un poco más de calma.</h1>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">Fija tus citas, elige tus rutinas y deja que Afaire encuentre un lugar para cada cosa.</p>
      <div className="mt-10 max-w-sm space-y-3 rounded-3xl border border-line bg-card p-6 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted">Un día con intención</p>
        {[["09:00", "Tu cita, en su lugar", "bg-paper"], ["10:10", "Un momento para avanzar", "bg-sage/10"], ["12:30", "Tiempo para una pausa", "bg-sage/10"]].map(([time, label, color]) => <div key={time} className={`flex items-center gap-4 rounded-xl px-3 py-3 ${color}`}><span className="text-xs tabular-nums text-muted">{time}</span><span className="text-sm">{label}</span></div>)}
      </div>
    </section>
    <section className="mx-auto w-full max-w-md rounded-3xl border border-line bg-card p-7 shadow-[0_24px_80px_-48px_rgba(31,26,22,.4)] sm:p-10">
      <div className="mb-5 flex justify-end"><ThemePicker /></div>
      <p className="display text-2xl text-sage lg:hidden">Afaire.</p>
      <p className="mt-2 text-xs uppercase tracking-widest text-sage">{register ? "Empieza aquí" : "Bienvenido de nuevo"}</p>
      <h2 className="mt-3 text-4xl">{register ? "Crea tu cuenta" : "Tu agenda te espera"}</h2>
      <p className="mt-3 text-sm text-muted">{register ? "Tu espacio personal para organizar cada día." : "Entra y descubre qué sigue hoy."}</p>
      <form className="mt-7 space-y-4" onSubmit={async event => {
        event.preventDefault(); setPending(true); setState({});
        const data = new FormData(event.currentTarget);
        try {
          if (register) {
            data.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Guayaquil");
            const result = await signup(data);
            if (!result.ok) { setState(result); return; }
          }
          const result = await signIn("credentials", { email: String(data.get("email")), password: String(data.get("password")), redirect: false });
          if (result?.error || !result?.ok) setState({ message: "Email o contraseña incorrectos. Si has hecho varios intentos, espera 15 minutos." });
          else window.location.assign(register ? "/onboarding" : "/");
        } catch { setState({ message: "No se pudo conectar. Inténtalo de nuevo." }); }
        finally { setPending(false); }
      }}>
        {register && <label className="block text-sm">Nombre<input name="name" required autoComplete="name" maxLength={80} className="field" /></label>}
        <label className="block text-sm">Email<input name="email" required type="email" autoComplete="email" maxLength={254} className="field" /></label>
        <label className="block text-sm">Contraseña<input name="password" required type="password" minLength={register ? 10 : 1} maxLength={72} autoComplete={register ? "new-password" : "current-password"} className="field" />{register && <span className="mt-1 block text-xs text-muted">Al menos 10 caracteres.</span>}</label>
        {register && inviteOnly && <label className="block text-sm">Código de invitación<input name="inviteCode" required type="password" className="field" /></label>}
        {state.errors && <p role="alert" className="text-sm text-terracotta">{Object.values(state.errors).flat().filter(Boolean).join(" ")}</p>}
        {state.message && <p role="alert" className="text-sm text-terracotta">{state.message}</p>}
        <button disabled={pending} className="w-full rounded-full bg-sage px-5 py-3 text-white transition hover:bg-ink">{pending ? "Un momento…" : register ? "Crear mi espacio →" : "Entrar →"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{register ? "¿Ya tienes una cuenta? " : "¿Primera vez aquí? "}<Link href={register ? "/login" : "/register"} className="text-sage underline underline-offset-4">{register ? "Inicia sesión" : "Crea tu cuenta"}</Link></p>
    </section>
  </main>;
}
