"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearOfflineDay } from "@/lib/offline-client";
import { removePushSubscription } from "@/app/actions/notifications";
import { signOut } from "next-auth/react";
import { ThemePicker } from "./ThemeProvider";
import { InstallButton } from "./PwaProvider";
import { BrandMark, HabitIcon, InboxIcon, KeyIcon, LogoutIcon, ReviewIcon, SettingsIcon, TodayIcon, WeekIcon } from "./Icons";

const links = [
  { href: "/", label: "Hoy", Icon: TodayIcon },
  { href: "/week", label: "Semana", Icon: WeekIcon },
  { href: "/habits", label: "Hábitos", Icon: HabitIcon },
  { href: "/inbox", label: "Bandeja", Icon: InboxIcon },
  { href: "/review", label: "Revisión", Icon: ReviewIcon },
  { href: "/settings", label: "Ajustes", Icon: SettingsIcon },
];

function isCurrent(path: string, href: string) {
  return href === "/" ? path === "/" || path === "/check-in" : path === href || path.startsWith(href + "/");
}

function AccountMenu({ name }: { name: string }) {
  const { t } = useI18n();
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

  return <details ref={account} className="account-menu relative">
    <summary aria-label={t(`Cuenta de ${name}`)} className="flex size-11 items-center justify-center rounded-full border border-line bg-card text-sm font-semibold text-sage transition hover:border-sage lg:size-auto lg:w-full lg:justify-start lg:gap-3 lg:rounded-2xl lg:border-transparent lg:bg-transparent lg:p-2 lg:hover:bg-card">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-soft text-sage lg:size-9">{initials || "A"}</span>
      <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-ink lg:block">{name}</span>
    </summary>
    <div className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-2xl border border-line bg-card p-4 shadow-lg lg:bottom-full lg:left-0 lg:right-auto lg:top-auto lg:mb-2 lg:mt-0">
      <div><p className="text-xs text-muted">{t("Tu cuenta")}</p><p className="mt-0.5 break-words text-sm font-semibold">{name}</p></div>
      <ThemePicker />
      <div className="space-y-1 border-t border-line pt-3">
        <Link onClick={closeAccount} href="/settings#sessions" className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-sunken"><KeyIcon className="size-[18px] text-muted" />{t("Sesiones activas")}</Link>
        <button disabled={leaving} onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-2 text-left text-sm text-terracotta hover:bg-sunken"><LogoutIcon className="size-[18px]" />{t(leaving ? "Cerrando sesión…" : "Cerrar sesión")}</button>
      </div>
      {error && <p role="alert" className="text-xs text-terracotta">{error}</p>}
    </div>
  </details>;
}

export function AppNav({ name }: { name: string }) {
  const { t } = useI18n(); const path = usePathname();
  return <>
    {/* Phones and tablets: slim top bar */}
    <header className="topbar sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight"><BrandMark className="size-8" />Afaire</Link>
        <div className="flex items-center gap-2"><InstallButton compact /><AccountMenu name={name} /></div>
      </div>
    </header>

    {/* Desktop: persistent sidebar */}
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-sunken/60 px-4 py-6 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2 font-display text-2xl font-semibold tracking-tight"><BrandMark />Afaire</Link>
      <nav aria-label={t("Principal")} className="mt-10 flex flex-col gap-1">
        {links.map(({ href, label, Icon }) => {
          const current = isCurrent(path, href);
          return <Link key={href} href={href} aria-current={current ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${current ? "bg-card text-ink shadow-sm" : "text-muted hover:bg-card/60 hover:text-ink"}`}>
            <Icon className={`size-5 ${current ? "text-sage" : ""}`} />{t(label)}
          </Link>;
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <InstallButton />
        <div className="border-t border-line pt-3"><AccountMenu name={name} /></div>
      </div>
    </aside>

    {/* Phones and tablets: bottom tab bar */}
    <nav aria-label={t("Principal")} className="tabbar fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-card/90 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <ul className="mx-auto grid h-(--tabbar-height) max-w-xl grid-cols-6">
        {links.map(({ href, label, Icon }) => {
          const current = isCurrent(path, href);
          return <li key={href} className="min-w-0">
            <Link href={href} aria-current={current ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 px-0.5 text-[10.5px] font-semibold leading-none transition ${current ? "text-sage" : "text-muted active:text-ink"}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${current ? "bg-sage-soft" : ""}`}><Icon className="size-[21px]" /></span>
              <span className="max-w-full truncate">{t(label)}</span>
            </Link>
          </li>;
        })}
      </ul>
    </nav>
  </>;
}
