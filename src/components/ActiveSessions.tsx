"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { closeSession, closeOtherSessions } from "@/app/actions/sessions";
import { clearOfflineDay } from "@/lib/offline-client";
import { displayDateTime } from "@/lib/locale";
import { useI18n } from "./LocaleProvider";
type Device = { id: string; label: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date };
export function ActiveSessions({ rows, currentId, timezone, legacyDevices = 0 }: { rows: Device[]; currentId: string; timezone: string; legacyDevices?: number }) {
  const { t, preferences } = useI18n(); const router = useRouter(); const [pending, setPending] = useState(""); const [message, setMessage] = useState(""); const [failed, setFailed] = useState(false);
  async function close(id: string) {
    if (!window.confirm(t(id === "OTHERS" ? "¿Cerrar todos los demás dispositivos?" : "¿Cerrar esta sesión?"))) return;
    setPending(id); setMessage("");
    try { const result = await (id === "OTHERS" ? closeOtherSessions() : closeSession(id)); setFailed(Boolean(result.error)); if (result.error) { setMessage(result.error); return; } if (id === currentId) { await signOut({ redirect: false }); await clearOfflineDay(); window.location.replace("/login"); } else { setMessage(t("Sesión cerrada.")); router.refresh(); } } catch { setFailed(true); setMessage(t("No se pudo guardar. Inténtalo de nuevo.")); } finally { setPending(""); }
  }
  return <section id="sessions" className="space-y-4 rounded-2xl border border-line bg-card p-5" aria-busy={Boolean(pending)}><h2 className="text-2xl">{t("Sesiones activas")}</h2><p className="text-sm text-muted">{t("Cada inicio de sesión aparece por separado. Cerrar un dispositivo revoca su acceso y sus avisos push. La copia offline ya descargada puede seguir visible hasta el fin del día.")}</p>{legacyDevices > 0 && <p className="text-sm text-muted">{t("Avisos de dispositivos anteriores")}: {legacyDevices}. {t("Hay dispositivos push anteriores al registro de sesiones. «Cerrar los demás dispositivos» también retira sus avisos.")}</p>}<ul className="space-y-3">{rows.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="font-medium">{device.label.split(" · ").map(part => t(part)).join(" · ")}{device.id === currentId && <span className="ml-2 text-xs text-sage">{t("Este dispositivo")}</span>}</p><p className="mt-1 text-xs text-muted">{t("Última actividad")}: {displayDateTime(device.lastSeenAt, timezone, preferences)}</p><p className="text-xs text-muted">{t("Inicio de sesión")}: {displayDateTime(device.createdAt, timezone, preferences)} · {t("Caduca")}: {displayDateTime(device.expiresAt, timezone, preferences)}</p></div><button disabled={Boolean(pending)} onClick={() => close(device.id)} aria-label={t("Cerrar sesión") + " · " + device.label} className="rounded-full border border-line px-4 py-2 text-sm text-terracotta">{t(pending === device.id ? "Guardando…" : "Cerrar sesión")}</button></li>)}</ul><button disabled={Boolean(pending) || (rows.length < 2 && !legacyDevices)} onClick={() => close("OTHERS")} className="rounded-full border border-line px-4 py-2 text-sm">{t("Cerrar los demás dispositivos")}</button>{message && <p role={failed ? "alert" : "status"} className="text-sm">{t(message)}</p>}</section>;
}
