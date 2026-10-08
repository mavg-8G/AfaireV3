"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = { installed: boolean; ios: boolean; secure: boolean; canPrompt: boolean; install(): Promise<void> };
const PwaContext = createContext<InstallState>({ installed: false, ios: false, secure: true, canPrompt: false, install: async () => {} });
export const usePwa = () => useContext(PwaContext);

function subscribeDevice(notify: () => void) {
  const mode = window.matchMedia("(display-mode: standalone)");
  mode.addEventListener("change", notify);
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { mode.removeEventListener("change", notify); window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
function deviceSnapshot() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return [standalone, ios, window.isSecureContext, navigator.onLine].map(value => value ? "1" : "0").join("|");
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const device = useSyncExternalStore(subscribeDevice, deviceSnapshot, () => "0|0|1|1").split("|");
  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const afterInstall = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall); window.addEventListener("appinstalled", afterInstall);
    if (process.env.NODE_ENV === "production" && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* Native installation instructions remain available. */ });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", afterInstall);
    };
  }, []);
  return <PwaContext.Provider value={{ installed: installed || device[0] === "1", ios: device[1] === "1", secure: device[2] === "1", canPrompt: Boolean(prompt), install: async () => {
    if (!prompt) return;
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === "accepted") setInstalled(true); }
    finally { setPrompt(null); }
  } }}>
    {device[3] === "0" && <p role="status" className="bg-ink px-5 py-3 text-center text-sm text-card">Sin conexión. Conéctate para consultar y guardar cambios en tu agenda.</p>}
    {children}
  </PwaContext.Provider>;
}
