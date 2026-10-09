"use client";
import { useI18n } from "@/components/LocaleProvider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { clearOfflineDay, openOfflinePlanner } from "@/lib/offline-client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CloseIcon, DownloadIcon, OfflineIcon, RefreshIcon, ShareIcon } from "./Icons";

function subscribeDevice(notify: () => void) {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
function deviceSnapshot() {
  return navigator.onLine;
}

/* ---------- Install support (Chrome/Edge/Android prompt, iOS instructions) ---------- */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = "unavailable" | "prompt" | "ios" | "installed";
let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const installListeners = new Set<() => void>();
function emitInstall() { installListeners.forEach(listener => listener()); }
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredPrompt = event as InstallPromptEvent; emitInstall(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; installed = true; emitInstall(); });
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
function installSnapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferredPrompt) return "prompt";
  return isIos() ? "ios" : "unavailable";
}
function subscribeInstall(notify: () => void) { installListeners.add(notify); return () => { installListeners.delete(notify); }; }
export function useInstallState() { return useSyncExternalStore(subscribeInstall, installSnapshot, () => "unavailable" as InstallState); }

export function InstallButton({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const state = useInstallState();
  const dialog = useRef<HTMLDialogElement>(null);
  if (state === "unavailable" || state === "installed") return null;
  async function install() {
    if (state === "ios") { dialog.current?.showModal(); return; }
    const prompt = deferredPrompt; if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") { deferredPrompt = null; emitInstall(); }
  }
  return <>
    <button type="button" onClick={install} aria-label={compact ? t("Instalar app") : undefined}
      className={compact ? "grid size-11 place-items-center rounded-full border border-line bg-card text-sage transition hover:border-sage" : "btn w-full justify-start gap-3 rounded-xl border-dashed bg-transparent px-3 text-sage"}>
      <DownloadIcon className="size-5" />{!compact && t("Instalar app")}
    </button>
    {state === "ios" && <dialog ref={dialog} aria-labelledby="ios-install-title" className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-line bg-card p-0 text-ink shadow-lg">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4"><h2 id="ios-install-title" className="text-2xl">{t("Instala Afaire en tu iPhone")}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={t("Cerrar")} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-sunken"><CloseIcon className="size-5" /></button></div>
        <ol className="mt-5 space-y-4 text-sm">
          <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-soft font-semibold text-sage">1</span><span>{t("Toca el botón Compartir")} <ShareIcon className="inline size-4 align-[-2px] text-sage" /> {t("en Safari.")}</span></li>
          <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-soft font-semibold text-sage">2</span><span>{t("Elige «Añadir a pantalla de inicio».")}</span></li>
          <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-soft font-semibold text-sage">3</span><span>{t("Abre Afaire desde el icono para recibir avisos y usarla sin conexión.")}</span></li>
        </ol>
        <button type="button" onClick={() => dialog.current?.close()} className="btn btn-primary mt-6 w-full">{t("Entendido")}</button>
      </div>
    </dialog>}
  </>;
}

/* ---------- Service worker updates ---------- */
function useServiceWorker() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onChange = () => { if (hadController) setUpdated(true); };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(registration => {
      // Installed apps can stay open for days; look for a new version when they come back to the foreground.
      const check = () => { if (document.visibilityState === "visible") void registration.update().catch(() => {}); };
      document.addEventListener("visibilitychange", check);
    }).catch(() => { /* Keep the agenda usable if registration fails. */ });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  return [updated, () => setUpdated(false)] as const;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  useEffect(() => { if (["/login", "/register"].includes(path)) void clearOfflineDay(); }, [path]);
  const online = useSyncExternalStore(subscribeDevice, deviceSnapshot, () => true);
  const [updated, dismissUpdate] = useServiceWorker();
  return <>
    {!online && <div role="status" className="relative z-40 bg-ink text-card">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm">
        <OfflineIcon className="size-4 shrink-0" />
        <span>{t("Sin conexión. Edita los bloques en la agenda guardada; los cambios se enviarán al reconectar.")}</span>
        <Link href="/?offline=1" prefetch={false} onClick={event => { event.preventDefault(); openOfflinePlanner(); }} className="font-semibold underline underline-offset-4">{t("Abrir agenda guardada")}</Link>
      </p>
    </div>}
    {children}
    {updated && <div role="status" className="floating-above-tabbar toast-in fixed inset-x-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-card p-3 pl-4 text-sm shadow-lg lg:right-6 lg:left-auto">
      <RefreshIcon className="size-5 shrink-0 text-sage" />
      <span className="flex-1">{t("Hay una versión nueva de Afaire.")}</span>
      <button type="button" onClick={() => window.location.reload()} className="btn btn-primary min-h-10 px-4">{t("Actualizar")}</button>
      <button type="button" onClick={dismissUpdate} aria-label={t("Cerrar")} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken"><CloseIcon className="size-4" /></button>
    </div>}
  </>;
}
