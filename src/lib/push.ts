import webpush from "web-push";
import { prisma } from "./prisma";
import { dueNotices, type PushNotice } from "./notifications";
import { addMinutesUtc, calendarDayBounds, dateOnly, ymdInZone } from "./time";
import { withUserLock } from "./transaction";

export function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
type PushTransport = typeof webpush.sendNotification;
export async function runPushNotifications(now = new Date(), options: { send?: PushTransport; userIds?: string[] } = {}) {
  if (!options.send && !pushConfigured()) return { sent: 0, failed: 0, expired: 0 };
  const users = await prisma.user.findMany({ where: { ...(options.userIds ? { id: { in: options.userIds } } : {}), pushSubscriptions: { some: {} }, notificationSettings: { isNot: null } }, include: { notificationSettings: true, pushSubscriptions: true } });
  let sent = 0, failed = 0, expired = 0;
  for (const user of users) {
    let userSent = 0, userFailed = 0, userExpired = 0;
    const messages = new Set<string>();
    try {
      const day = ymdInZone(now, user.timezone), bounds = calendarDayBounds(day, user.timezone);
      const [events, tasks] = await Promise.all([
        prisma.event.findMany({ where: { userId: user.id, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: addMinutesUtc(bounds.end, 300) }, endsAt: { gt: bounds.start } } }),
        prisma.task.findMany({ where: { userId: user.id, archived: false, status: { in: ["INBOX", "SCHEDULED"] } } }),
      ]);
      const candidates = dueNotices(now, user.timezone, user.notificationSettings!, events, tasks, user.locale);
      for (const subscription of user.pushSubscriptions) {
        const validSession = await withUserLock(user.id, async tx => {
          const owner = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
          const current = await tx.pushSubscription.findUnique({ where: { id: subscription.id } });
          if (!current) return false;
          const device = current.deviceSessionId ? await tx.deviceSession.findFirst({ where: { id: current.deviceSessionId, userId: user.id, revokedAt: null, expiresAt: { gt: now } } }) : true;
          if (device && current.sessionVersion === owner.sessionVersion) return true;
          await tx.pushSubscription.delete({ where: { id: current.id } });
          return false;
        });
        if (!validSession) continue;
        for (const candidate of candidates) {
          // Calendar writes and delivery share a lock. A change committed before
          // this check cannot send a stale reminder; edits wait during transport.
          const outcome = await withUserLock(user.id, async tx => {
            const currentUser = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { notificationSettings: true } });
            const currentSubscription = await tx.pushSubscription.findFirst({ where: { id: subscription.id, userId: user.id } });
            if (!currentSubscription) return { status: "ignored" };
            const device = currentSubscription.deviceSessionId ? await tx.deviceSession.findFirst({ where: { id: currentSubscription.deviceSessionId, userId: user.id, revokedAt: null, expiresAt: { gt: options.send ? now : new Date() } } }) : true;
            if (!device || currentSubscription.sessionVersion !== currentUser.sessionVersion) {
              await tx.pushSubscription.delete({ where: { id: subscription.id } });
              return { status: "expired", message: "Dispositivo retirado por cambio de sesión." };
            }
            if (!currentUser.notificationSettings) return { status: "ignored" };
            const deliveryNow = options.send ? now : new Date();
            const currentBounds = calendarDayBounds(ymdInZone(deliveryNow, currentUser.timezone), currentUser.timezone);
            const [currentEvents, currentTasks] = await Promise.all([
              tx.event.findMany({ where: { userId: user.id, startsAt: { lt: addMinutesUtc(currentBounds.end, 300) }, endsAt: { gt: currentBounds.start } } }),
              tx.task.findMany({ where: { userId: user.id, archived: false, status: { in: ["INBOX", "SCHEDULED"] } } }),
            ]);
            const notice: PushNotice | undefined = dueNotices(deliveryNow, currentUser.timezone, currentUser.notificationSettings, currentEvents, currentTasks, currentUser.locale).find(n => n.key === candidate.key);
            if (!notice) return { status: "ignored" };
            // Honor keys created before lead time and travel were removed from the key.
            const legacy = notice.key.startsWith("event:") ? await tx.pushDelivery.findFirst({ where: { subscriptionId: subscription.id, key: { startsWith: notice.key + ":" } }, orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { attempts: "desc" }] }) : null;
            const delivery = legacy ?? await tx.pushDelivery.upsert({ where: { subscriptionId_key: { subscriptionId: subscription.id, key: notice.key } }, create: { subscriptionId: subscription.id, key: notice.key, attemptedAt: new Date(0) }, update: {} });
            if (delivery.sentAt || delivery.attempts >= 5 || delivery.attemptedAt >= new Date(deliveryNow.getTime() - 120_000)) return { status: "ignored" };
            await tx.pushDelivery.update({ where: { id: delivery.id }, data: { attemptedAt: deliveryNow, attempts: { increment: 1 } } });
            try {
              const event = currentEvents.find(e => notice.key === `event:${e.id}:${e.startsAt.toISOString()}`);
              const ttl = event ? Math.max(1, Math.min(300, Math.floor((event.startsAt.getTime() - deliveryNow.getTime()) / 1000))) : 300;
              await (options.send ?? webpush.sendNotification)({ endpoint: currentSubscription.endpoint, keys: { auth: currentSubscription.auth, p256dh: currentSubscription.p256dh } }, JSON.stringify(notice), { vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! }, TTL: ttl, timeout: 5000 });
              await tx.pushDelivery.update({ where: { id: delivery.id }, data: { sentAt: deliveryNow, error: null } });
              return { status: "sent" };
            } catch (error) {
              const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
              if ([404, 410].includes(status)) {
                await tx.pushSubscription.delete({ where: { id: subscription.id } });
                return { status: "expired", message: `Dispositivo caducado retirado: HTTP ${status}.` };
              }
              const message = status ? `Proveedor push: HTTP ${status}` : "No se pudo conectar con el proveedor push.";
              await tx.pushDelivery.update({ where: { id: delivery.id }, data: { error: message } });
              return { status: "failed", message };
            }
          });
          if (outcome.status === "sent") userSent++;
          if (outcome.status === "failed") userFailed++;
          if (outcome.message) messages.add(outcome.message);
          if (outcome.status === "expired") { userExpired++; break; }
        }
      }
    } catch {
      userFailed++;
      messages.add("Error al procesar avisos. Revisa los logs del worker.");
      console.error(JSON.stringify({ worker: "push", userId: user.id, message: "Error de procesamiento de avisos" }));
    }
    if (userSent || userFailed || userExpired) await prisma.workerRun.create({ data: {
      userId: user.id, kind: "PUSH", date: dateOnly(ymdInZone(now, user.timezone)), attemptedAt: now,
      status: userFailed ? "FAILED" : userExpired ? "EXPIRED" : "SUCCESS",
      message: `${userSent} enviados; ${userFailed} fallidos; ${userExpired} dispositivos retirados. ${[...messages].join(" ")}`,
    } });
    sent += userSent; failed += userFailed; expired += userExpired;
  }
  await prisma.pushDelivery.deleteMany({ where: { ...(options.userIds ? { subscription: { userId: { in: options.userIds } } } : {}), attemptedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
  await prisma.workerRun.deleteMany({ where: { kind: "PUSH", ...(options.userIds ? { userId: { in: options.userIds } } : {}), attemptedAt: { lt: new Date(now.getTime() - 30 * 86400_000) } } });
  if (!options.userIds) await prisma.workerHeartbeat.upsert({ where: { id: "push" }, create: { id: "push", updatedAt: now }, update: { updatedAt: now } });
  return { sent, failed, expired };
}
