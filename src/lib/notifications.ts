import { translator } from "./locale";
import { z } from "zod";
import { TimeSchema } from "./definitions";
import { addLocalDays, dateOnly, formatTime, ymdInZone } from "./time";

export const NotificationSchema = z.object({
  upcoming: z.boolean(), leadMinutes: z.coerce.number().int().min(1).max(120),
  dailySummary: z.boolean(), summaryTime: TimeSchema,
  dueTomorrow: z.boolean(), dueTime: TimeSchema,
  quietEnabled: z.boolean().default(false), quietStart: TimeSchema.default("22:00"), quietEnd: TimeSchema.default("08:00"),
});
export function inQuietHours(now: Date, timezone: string, settings: { quietEnabled?: boolean; quietStart?: string; quietEnd?: string }) {
  if (!settings.quietEnabled) return false;
  const time = formatTime(now, timezone), start = settings.quietStart ?? "22:00", end = settings.quietEnd ?? "08:00";
  return start === end || (start < end ? time >= start && time < end : time >= start || time < end);
}
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname === "fcm.googleapis.com" || u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.services.mozilla.com") || u.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export const SubscriptionSchema = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint), keys: z.object({
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,1}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
}) });
export type PushNotice = { key: string; title: string; body: string; url: string };
export function dueNotices(now: Date, timezone: string, settings: z.input<typeof NotificationSchema>, events: { id: string; title: string; startsAt: Date; status: string; travelMinutes?: number }[], tasks: { title: string; dueDate: Date | null }[], locale = "es") {
  const t = translator(locale);
  if (inQuietHours(now, timezone, settings)) return [];
  const day = ymdInZone(now, timezone); const time = formatTime(now, timezone);
  const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const near = (hm: string) => minutes(time) >= minutes(hm) && minutes(time) < minutes(hm) + 60;
  const notices: PushNotice[] = [];
  if (settings.upcoming) for (const event of events) {
    const travel = event.travelMinutes ?? 0;
    const remaining = Math.ceil((event.startsAt.getTime() - now.getTime()) / 60_000) - travel;
    if (event.status === "PENDING" && remaining > 0 && remaining <= Number(settings.leadMinutes)) notices.push({ key: `event:${event.id}:${event.startsAt.toISOString()}`, title: t(`Tu próximo bloque empieza en ${remaining + travel} min`), body: event.title + (travel ? t(` · reserva ${travel} min para el traslado`) : ""), url: `/?date=${ymdInZone(event.startsAt, timezone)}` });
  }
  if (settings.dailySummary && near(settings.summaryTime)) {
    const today = events.filter(e => ymdInZone(e.startsAt, timezone) <= day && !["SKIPPED", "CANCELLED"].includes(e.status));
    notices.push({ key: `summary:${day}`, title: t("Tu resumen del día"), body: t(`${today.length} bloques en tu agenda. ${today.filter(e => e.status === "DONE").length} completados.`), url: "/" });
  }
  if (settings.dueTomorrow && near(settings.dueTime)) {
    const tomorrow = dateOnly(addLocalDays(day, 1)).getTime();
    const due = tasks.filter(t => t.dueDate?.getTime() === tomorrow);
    if (due.length) notices.push({ key: `due:${day}`, title: t(`${due.length} tareas vencen mañana`), body: due.slice(0, 3).map(t => t.title).join(" · ").slice(0, 180), url: "/inbox" });
  }
  return notices;
}
