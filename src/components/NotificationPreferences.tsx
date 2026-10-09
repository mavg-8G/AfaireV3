"use client";
import { useI18n } from "@/components/LocaleProvider";
import { useState } from "react";
import type { NotificationSettings } from "@prisma/client";
import { addPushSubscription, removePushSubscription, removeAllPushSubscriptions, saveNotificationSettings } from "@/app/actions/notifications";
import { ActionButton } from "./ActionButton";
export function NotificationPreferences({ settings, publicKey, devices }: { settings: NotificationSettings | null; publicKey: string | null; devices: number }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function subscribe(enable: boolean) {
    setPending(true); setMessage("");
    try {
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error(t("Este navegador no admite avisos aquí. En iOS abre Afaire instalada desde la pantalla de inicio."));
      if (enable && !publicKey) throw new Error(t("Falta configurar Web Push en el servidor."));
      const permission = enable ? await Notification.requestPermission() : Notification.permission;
      if (enable && permission !== "granted") throw new Error(t("No se autorizó el permiso. Puedes cambiarlo en los ajustes del navegador."));
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        const raw = atob(publicKey!.replace(/-/g, "+").replace(/_/g, "/"));
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0)) });
        const result = await addPushSubscription(subscription.toJSON());
        if (result.error) throw new Error(result.error);
        setMessage(t("Avisos activados en este dispositivo."));
      } else {
        if (subscription) { const result = await removePushSubscription(subscription.endpoint); if (result.error) throw new Error(result.error); await subscription.unsubscribe(); }
        setMessage(t("Avisos desactivados en este dispositivo."));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : t("No se pudieron configurar los avisos.")); }
    finally { setPending(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-line bg-card p-5"><h2 className="text-2xl">{t("Notificaciones")}</h2><p className="text-xs text-muted">{devices} {t(" dispositivos registrados. En iOS requiere instalar Afaire en la pantalla de inicio. Los avisos pueden mostrar títulos en la pantalla bloqueada.")}</p>
    {!publicKey && <p className="text-sm text-terracotta">{t("El servidor aún no tiene claves Web Push configuradas.")}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={pending || !publicKey} onClick={() => subscribe(true)} className="rounded-full bg-sage px-4 py-2 text-sm text-white">{t("Activar en este dispositivo")}</button><button disabled={pending} onClick={() => subscribe(false)} className="rounded-full border border-line px-4 py-2 text-sm">{t("Desactivar aquí")}</button><ActionButton action={removeAllPushSubscriptions} confirm={t("¿Desactivar los avisos en todos tus dispositivos?")}>{t("Desactivar en todos")}</ActionButton></div>
    <form aria-busy={pending} className="space-y-3 text-sm" onSubmit={async e => { e.preventDefault(); setPending(true); try { const result = await saveNotificationSettings(new FormData(e.currentTarget)); setMessage(result.error ?? t("Preferencias de avisos guardadas.")); } catch { setMessage(t("No se pudo guardar.")); } finally { setPending(false); } }}>
      <label className="flex gap-2"><input name="upcoming" type="checkbox" defaultChecked={settings?.upcoming ?? true} />{t("Avisar antes del próximo bloque")}</label><label className="block">{t("Antelación · minutos")}<input className="field" name="leadMinutes" type="number" min={1} max={120} defaultValue={settings?.leadMinutes ?? 10} required /></label>
      <label className="flex gap-2"><input name="dailySummary" type="checkbox" defaultChecked={settings?.dailySummary ?? true} />{t("Resumen del día")}</label><label className="block">{t("Hora del resumen")}<input className="field" name="summaryTime" type="time" defaultValue={settings?.summaryTime ?? "08:00"} required /></label>
      <label className="flex gap-2"><input name="dueTomorrow" type="checkbox" defaultChecked={settings?.dueTomorrow ?? true} />{t("Tareas que vencen mañana")}</label><label className="block">{t("Hora del aviso de vencimientos")}<input className="field" name="dueTime" type="time" defaultValue={settings?.dueTime ?? "18:00"} required /></label>
      <fieldset className="space-y-3 rounded-xl border border-line p-3"><legend>{t("Horas de silencio")}</legend><label className="flex gap-2"><input name="quietEnabled" type="checkbox" defaultChecked={settings?.quietEnabled ?? false} />{t("Silenciar todos los avisos en esta franja")}</label><div className="grid grid-cols-2 gap-3"><label>{t("Desde")}<input className="field" name="quietStart" type="time" required defaultValue={settings?.quietStart ?? "22:00"} /></label><label>{t("Hasta")}<input className="field" name="quietEnd" type="time" required defaultValue={settings?.quietEnd ?? "08:00"} /></label></div><p className="text-xs text-muted">{t("Puede cruzar medianoche. Si ambas horas coinciden, se silencia todo el día. Los avisos que ya pasaron su ventana no se recuperan después.")}</p></fieldset>
      <p className="text-xs text-muted">{t("Las horas usan tu zona horaria. El worker comprueba los avisos cada minuto; su llegada depende del navegador y la conexión. Los dispositivos caducados se retiran automáticamente cuando el proveedor devuelve 404 o 410.")}</p><button disabled={pending} className="rounded-full border border-line px-4 py-2">{t("Guardar avisos")}</button>
    </form>{message && <p role="status" className="text-sm">{t(message)}</p>}
  </section>;
}
