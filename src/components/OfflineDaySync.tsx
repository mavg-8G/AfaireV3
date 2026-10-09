"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useEffect } from "react";
export function OfflineDaySync({ revision }: { revision: string }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let stopped = false;
    const update = async () => {
      if (!navigator.onLine) return;
      const registration = await navigator.serviceWorker.getRegistration();
      if (!stopped) registration?.active?.postMessage({ type: "REFRESH_DAY" });
    };
    void update();
    const timer = setInterval(() => { void update(); }, 60_000);
    window.addEventListener("online", update);
    navigator.serviceWorker.addEventListener("controllerchange", update);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("online", update); navigator.serviceWorker.removeEventListener("controllerchange", update); };
  }, [revision]);
  return <p className="text-xs text-muted">{t("La última copia de hoy estará disponible en lectura si pierdes la conexión.")}</p>;
}
