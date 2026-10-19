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
import { PasswordDialog } from "./PasswordDialog";
import { BrandMark, CloseIcon, DeviceIcon, HabitIcon, InboxIcon, KeyIcon, LogoutIcon, MoreIcon, ReviewIcon, SettingsIcon, TodayIcon, WeekIcon } from "./Icons";

const links = [
  { href: "/", label: "Hoy", Icon: TodayIcon },
  { href: "/week", label: "Semana", Icon: WeekIcon },
  { href: "/habits", label: "Hábitos", Icon: HabitIcon },
  { href: "/inbox", label: "Bandeja", Icon: InboxIcon },
  { href: "/review", label: "Revisión", Icon: ReviewIcon },
  { href: "/settings", label: "Ajustes", Icon: SettingsIcon },
];

// The phone tab bar keeps four destinations; the rest live behind "Más" so every tab stays a comfortable tap target.
const tabs = links.slice(0, 4);
const moreLinks = [...links.slice(4), { href: "/sessions", label: "Sesiones activas", Icon: DeviceIcon }];

// The CSP forbids inline styles, so the sliding indicators move through fixed translate classes, one per link.
const rail = ["translate-y-0", "translate-y-12", "translate-y-24", "translate-y-36", "translate-y-48", "translate-y-60"];
const slide = ["translate-x-0", "translate-x-full", "translate-x-[200%]", "translate-x-[300%]", "translate-x-[400%]"];

// Plain left clicks are client navigations; modified clicks open a new tab and must not move the highlight.
function plainClick(event: React.MouseEvent) { return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey; }

function isCurrent(path: string, href: string) {
  return href === "/" ? path === "/" || path === "/check-in" : path === href || path.startsWith(href + "/");
}

function AccountMenu({ name }: { name: string }) {
  const { t } = useI18n();
  const account = useRef<HTMLDetailsElement>(null); const [leaving, setLeaving] = useState(false); const [error, setError] = useState("");
  const password = useRef<HTMLDialogElement>(null); const [passwordSession, setPasswordSession] = useState(0);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toLocaleUpperCase();
  function closeAccount() { if (account.current) account.current.open = false; }
  function openPassword() { closeAccount(); setPasswordSession(session => session + 1); password.current?.showModal(); }
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

  return <><details ref={account} className="account-menu relative">
    <summary aria-label={t(`Cuenta de ${name}`)} className="flex size-11 items-center justify-center rounded-full border border-line bg-card text-sm font-semibold text-sage transition hover:border-sage lg:size-auto lg:w-full lg:justify-start lg:gap-3 lg:rounded-2xl lg:p-2 lg:shadow-sm">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-soft text-sage lg:size-9">{initials || "A"}</span>
      <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-ink lg:block">{name}</span>
    </summary>
    <div className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-3xl border border-line bg-card p-4 shadow-lg lg:bottom-full lg:left-0 lg:right-auto lg:top-auto lg:mb-2 lg:mt-0">
      <div><p className="text-xs text-muted">{t("Tu cuenta")}</p><p className="mt-0.5 break-words text-sm font-semibold">{name}</p></div>
      <ThemePicker />
      <div className="space-y-1 border-t border-line pt-3">
        <button type="button" onClick={openPassword} className="flex w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-sunken"><KeyIcon className="size-[18px] text-muted" />{t("Cambiar contraseña")}</button>
        <Link onClick={closeAccount} href="/sessions" className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-sunken"><DeviceIcon className="size-[18px] text-muted" />{t("Sesiones activas")}</Link>
        <button disabled={leaving} onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-2 text-left text-sm text-terracotta hover:bg-sunken"><LogoutIcon className="size-[18px]" />{t(leaving ? "Cerrando sesión…" : "Cerrar sesión")}</button>
      </div>
      {error && <p role="alert" className="text-xs text-terracotta">{error}</p>}
    </div>
  </details>
  {/* Outside the menu: a closed <details> would hide the modal along with its content. */}
  <PasswordDialog dialogRef={password} session={passwordSession} /></>;
}

export function AppNav({ name }: { name: string }) {
  const { t } = useI18n(); const actualPath = usePathname();
  // Highlight the tapped destination at once instead of waiting for the server render to arrive.
  const [tapped, setTapped] = useState<{ from: string; href: string } | null>(null);
  const path = tapped && tapped.from === actualPath ? tapped.href : actualPath;
  const more = useRef<HTMLDialogElement>(null);
  const go = (href: string) => (event: React.MouseEvent) => { more.current?.close(); if (plainClick(event) && !isCurrent(actualPath, href)) setTapped({ from: actualPath, href }); };
  const active = links.findIndex(({ href }) => isCurrent(path, href));
  const tab = tabs.findIndex(({ href }) => isCurrent(path, href));
  const moreActive = tab < 0 && moreLinks.some(({ href }) => isCurrent(path, href));
  const tabSlot = tab >= 0 ? tab : moreActive ? 4 : -1;
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
      <nav aria-label={t("Principal")} className="relative mt-10 flex flex-col gap-1">
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-11 rounded-xl bg-card shadow-sm transition-transform duration-300 ease-(--ease-out) ${active < 0 ? "opacity-0" : rail[active]}`} />
        {links.map(({ href, label, Icon }) => {
          const current = isCurrent(path, href);
          return <Link key={href} href={href} onClick={go(href)} aria-current={current ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${current ? "text-ink" : "text-muted hover:bg-card/60 hover:text-ink"}`}>
            <Icon className={`size-5 transition-transform duration-200 group-hover:scale-110 ${current ? "text-sage" : ""}`} />{t(label)}
          </Link>;
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <InstallButton />
        <div className="border-t border-line pt-3"><AccountMenu name={name} /></div>
      </div>
    </aside>

    {/* Phones and tablets: bottom tab bar */}
    <div className="tabbar pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <nav aria-label={t("Principal")} className="pointer-events-auto relative mx-auto h-(--tabbar-height) max-w-xl bg-card">
        <span aria-hidden="true" className={`absolute inset-y-1.5 left-0 w-1/5 p-0.5 transition-transform duration-200 ease-(--ease-out) ${tabSlot < 0 ? "opacity-0" : slide[tabSlot]}`}><span className="block size-full rounded-2xl bg-sage-soft" /></span>
        <ul className="relative grid h-full grid-cols-5">
          {tabs.map(({ href, label, Icon }) => {
            const current = isCurrent(path, href);
            return <li key={href} className="min-w-0">
              <Link href={href} onClick={go(href)} aria-current={current ? "page" : undefined}
                className={`tab-target flex h-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-none transition-colors duration-100 active:scale-95 ${current ? "text-sage" : "text-muted active:text-ink"}`}>
                <Icon className="size-[22px]" />
                <span className="max-w-full truncate">{t(label)}</span>
              </Link>
            </li>;
          })}
          <li className="min-w-0">
            <button type="button" onClick={() => more.current?.showModal()} aria-haspopup="dialog" aria-current={moreActive ? "page" : undefined}
              className={`tab-target flex h-full w-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-none transition-colors duration-100 active:scale-95 ${moreActive ? "text-sage" : "text-muted active:text-ink"}`}>
              <MoreIcon className="size-[22px]" />
              <span className="max-w-full truncate">{t("Más")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>

    {/* "Más": a bottom sheet with the destinations that don't fit in the tab bar. Clicking the backdrop closes it. */}
    <dialog ref={more} aria-labelledby="more-title" onClick={event => { if (event.target === event.currentTarget) more.current?.close(); }}
      className="more-sheet mx-auto mb-0 mt-auto w-full max-w-xl rounded-t-3xl border border-b-0 border-line bg-card p-0 text-ink shadow-lg lg:hidden">
      <div className="px-5 pt-3">
        <span aria-hidden="true" className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
        <div className="mt-3 flex items-center justify-between gap-4"><h2 id="more-title" className="font-display text-xl font-semibold">{t("Más opciones")}</h2><button type="button" onClick={() => more.current?.close()} aria-label={t("Cerrar")} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-sunken"><CloseIcon className="size-5" /></button></div>
        <ul className="mt-2 space-y-1">
          {moreLinks.map(({ href, label, Icon }) => {
            const current = isCurrent(path, href);
            return <li key={href}><Link href={href} onClick={go(href)} aria-current={current ? "page" : undefined}
              className={`tab-target flex min-h-13 items-center gap-4 rounded-2xl px-3 text-base font-medium transition-colors duration-100 ${current ? "bg-sage-soft text-sage" : "active:bg-sunken"}`}>
              <Icon className="size-[22px]" />{t(label)}
            </Link></li>;
          })}
        </ul>
      </div>
    </dialog>
  </>;
}
