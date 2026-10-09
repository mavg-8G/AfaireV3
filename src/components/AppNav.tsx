"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearOfflineDay } from "@/lib/offline-client";
import { removePushSubscription } from "@/app/actions/notifications";
import { signOut } from "next-auth/react";
import { ThemePicker } from "./ThemeProvider";
const links = [{ href: "/", label: "Hoy" }, { href: "/week", label: "Semana" }, { href: "/habits", label: "Hábitos" }, { href: "/inbox", label: "Bandeja" }, { href: "/review", label: "Revisión" }, { href: "/settings", label: "Ajustes" }];
export function AppNav({ name }: { name: string }) {
  const { t } = useI18n(); const path = usePathname();
  const account = useRef<HTMLDetailsElement>(null); const [leaving, setLeaving] = useState(false); const [error, setError] = useState("");
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toLocaleUpperCase();
  function closeAccount() { if (account.current) account.current.open = false; }
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (account.current && !account.current.contains(event.target as Node)) account.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && account.current?.open) { account.current.open = false; account.current.querySelector("summary")?.focus(); } };
    const focusOutside = (event: FocusEvent) => { if (account.current && !account.current.contains(event.target as Node)) account.current.open = false; };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape); document.addEventListener("focusin", focusOutside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", focusOutside); };
  }, []);
  async function logout() {
    setLeaving(true); setError("");
    try {
      try { if ("serviceWorker" in navigator) { const registration = await navigator.serviceWorker.getRegistration(); const subscription = await registration?.pushManager.getSubscription(); if (subscription) { try { await removePushSubscription(subscription.endpoint); } finally { await subscription.unsubscribe(); } } } } catch { /* Session revocation also retires this device's push on the server. */ }
      await signOut({ redirect: false }); await clearOfflineDay(); window.location.replace("/login");
    } catch { setError(t("No se pudo cerrar sesión. Inténtalo de nuevo.")); setLeaving(false); }
  }
  return <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
    <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-x-4 px-5 py-3 md:gap-x-6">
      <Link href="/" onClick={closeAccount} className="display flex w-fit items-center gap-2 text-2xl tracking-tight"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-xl bg-sage text-base text-white">a.</span>Afaire</Link>
      <nav aria-label={t("Principal")} className="col-span-3 row-start-2 mt-3 flex min-w-0 gap-1 overflow-x-auto border-t border-line pt-3 text-sm md:col-span-1 md:col-start-2 md:row-start-1 md:mt-0 md:justify-center md:border-0 md:pt-0">
        {links.map(link => <Link key={link.href} onClick={closeAccount} href={link.href} aria-current={path === link.href ? "page" : undefined} className={`flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-2 transition ${path === link.href ? "bg-ink text-card" : "text-muted hover:bg-paper"}`}>{t(link.label)}</Link>)}
      </nav>
      <details ref={account} className="account-menu relative col-start-3 row-start-1 justify-self-end">
        <summary aria-label={t(`Cuenta de ${name}`)} className="flex size-11 items-center justify-center rounded-full border border-line bg-paper text-sm font-medium text-sage hover:border-sage"><span aria-hidden="true">{initials || "A"}</span></summary>
        <div className="absolute right-0 top-full mt-3 w-72 max-w-[calc(100vw-2.5rem)] space-y-4 rounded-2xl border border-line bg-card p-4 shadow-lg">
          <div><p className="text-xs text-muted">{t("Tu cuenta")}</p><p className="mt-1 break-words text-sm font-medium">{name}</p></div>
          <div className="border-y border-line py-3"><ThemePicker /></div>
          <Link onClick={closeAccount} href="/settings#sessions" className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-paper">{t("Sesiones activas")}</Link>
          <button disabled={leaving} onClick={logout} className="w-full rounded-full border border-line px-4 py-2 text-left text-sm text-terracotta">{t(leaving ? "Cerrando sesión…" : "Salir ↗")}</button>
          {error && <p role="alert" className="text-xs text-terracotta">{error}</p>}
        </div>
      </details>
    </div>
  </header>;
}
