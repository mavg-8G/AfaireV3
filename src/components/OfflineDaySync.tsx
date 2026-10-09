"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { openOfflinePlanner } from "@/lib/offline-client";
export function OfflineDaySync({ revision }: { revision: string }) {
  const { t } = useI18n();
  const [queue, setQueue] = useState({ pending: 0, conflicts: 0 });
  const router = useRouter();
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
    const queueUpdate = (event: MessageEvent) => {
      if (event.data?.type !== "CHANGE_QUEUE_UPDATE") return;
      setQueue({ pending: event.data.pending, conflicts: event.data.conflicts });
      if (event.data.applied > 0) router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", queueUpdate);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("online", update); navigator.serviceWorker.removeEventListener("controllerchange", update); navigator.serviceWorker.removeEventListener("message", queueUpdate); };
  }, [revision, router]);
  return <div className="space-y-1 text-xs text-muted"><p>{t("Puedes editar la copia de hoy sin conexión. Los cambios se enviarán al reconectar.")}</p><Link href="/?offline=1" prefetch={false} onClick={event => { event.preventDefault(); openOfflinePlanner(); }} className="text-sage underline">{t("Abrir agenda guardada y cambios pendientes")}</Link>{queue.pending > 0 && <p role="status">{t(`Cambios pendientes: ${queue.pending}`)}{queue.conflicts > 0 && ` · ${t("Hay conflictos que revisar")}`}</p>}</div>;
}
