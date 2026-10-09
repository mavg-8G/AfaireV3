"use client";
import { useI18n } from "@/components/LocaleProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearOfflineDay } from "@/lib/offline-client";
import { removePushSubscription } from "@/app/actions/notifications";
import { signOut } from "next-auth/react";
import { ThemePicker } from "./ThemeProvider";
const links = [{ href: "/", label: "Hoy" }, { href: "/week", label: "Semana" }, { href: "/habits", label: "Hábitos" }, { href: "/inbox", label: "Bandeja" }, { href: "/review", label: "Revisión" }, { href: "/settings", label: "Ajustes" }];
export function AppNav({ name }: { name: string }) {
  const { t } = useI18n();
  const path = usePathname();
  return <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      <Link href="/" className="display flex items-center gap-2 text-2xl tracking-tight"><span className="flex size-8 items-center justify-center rounded-xl bg-sage text-base text-white">a.</span>Afaire<span className="ml-1 hidden text-xs font-sans uppercase tracking-[.2em] text-muted md:inline">{t("un día a la vez")}</span></Link>
      <div className="flex flex-wrap items-center gap-3 text-sm"><ThemePicker /><span className="hidden max-w-32 truncate text-muted sm:inline">{name.split(" ")[0]}</span><button onClick={async () => { try { if ("serviceWorker" in navigator) { const registration = await navigator.serviceWorker.getRegistration(); const subscription = await registration?.pushManager.getSubscription(); if (subscription) { try { await removePushSubscription(subscription.endpoint); } finally { await subscription.unsubscribe(); } } } } catch { /* Local logout still clears the private copy. */ }
        await signOut({ redirect: false }); await clearOfflineDay(); window.location.replace("/login"); }} className="text-muted hover:text-terracotta">{t("Salir ↗")}</button></div>
      <nav aria-label={t("Principal")} className="flex min-w-0 w-full gap-1 overflow-x-auto text-sm md:order-none md:w-auto">
        {links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} className={`whitespace-nowrap rounded-full px-4 py-2 transition ${path === link.href ? "bg-ink text-card" : "text-muted hover:bg-paper"}`}>{t(link.label)}</Link>)}
      </nav>
    </div>
  </header>;
}
