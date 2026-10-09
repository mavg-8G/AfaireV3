"use client";
import { useI18n } from "@/components/LocaleProvider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { clearOfflineDay, openOfflinePlanner } from "@/lib/offline-client";
import { useEffect, useSyncExternalStore } from "react";

function subscribeDevice(notify: () => void) {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
function deviceSnapshot() {
  return navigator.onLine;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  useEffect(() => { if (["/login", "/register"].includes(path)) void clearOfflineDay(); }, [path]);
  const online = useSyncExternalStore(subscribeDevice, deviceSnapshot, () => true);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* Keep the agenda usable if registration fails. */ });
    }
  }, []);
  return <>
    {!online && <p role="status" className="bg-ink px-5 py-3 text-center text-sm text-card">{t("Sin conexión. Edita los bloques en la agenda guardada; los cambios se enviarán al reconectar.")} <Link href="/?offline=1" prefetch={false} onClick={event => { event.preventDefault(); openOfflinePlanner(); }} className="underline">{t("Abrir agenda guardada")}</Link></p>}
    {children}
  </>;
}
