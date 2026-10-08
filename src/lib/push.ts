import { Prisma } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "./prisma";
import { dueNotices } from "./notifications";
import { addMinutesUtc, calendarDayBounds, ymdInZone } from "./time";

export function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
type PushTransport = typeof webpush.sendNotification;
export async function runPushNotifications(now = new Date(), options: { send?: PushTransport; userIds?: string[] } = {}) {
  if (!options.send && !pushConfigured()) return { sent: 0, failed: 0 };
  const users = await prisma.user.findMany({ where: { ...(options.userIds ? { id: { in: options.userIds } } : {}), pushSubscriptions: { some: {} }, notificationSettings: { isNot: null } }, include: { notificationSettings: true, pushSubscriptions: true } });
  let sent = 0; let failed = 0;
  for (const user of users) {
    const day = ymdInZone(now, user.timezone); const bounds = calendarDayBounds(day, user.timezone);
    const [events, tasks] = await Promise.all([
      prisma.event.findMany({ where: { userId: user.id, status: { notIn: ["CANCELLED", "SKIPPED"] }, startsAt: { lt: addMinutesUtc(bounds.end, 300) }, endsAt: { gt: bounds.start } } }),
      prisma.task.findMany({ where: { userId: user.id, archived: false, status: { in: ["INBOX", "SCHEDULED"] } } }),
    ]);
    const notices = dueNotices(now, user.timezone, user.notificationSettings!, events, tasks);
    for (const subscription of user.pushSubscriptions) {
      if (subscription.sessionVersion !== user.sessionVersion) { await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } }); continue; }
      for (const notice of notices) {
        try { await prisma.pushDelivery.createMany({ data: [{ subscriptionId: subscription.id, key: notice.key, attemptedAt: new Date(0) }], skipDuplicates: true }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") break; throw error; }
        const delivery = await prisma.pushDelivery.findUnique({ where: { subscriptionId_key: { subscriptionId: subscription.id, key: notice.key } } });
        if (!delivery) continue;
        const claimed = await prisma.pushDelivery.updateMany({ where: { id: delivery.id, sentAt: null, attempts: { lt: 5 }, attemptedAt: { lt: new Date(now.getTime() - 120_000) } }, data: { attemptedAt: now, attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try {
          await (options.send ?? webpush.sendNotification)({ endpoint: subscription.endpoint, keys: { auth: subscription.auth, p256dh: subscription.p256dh } }, JSON.stringify(notice), { vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! }, TTL: 300, timeout: 5000 });
          await prisma.pushDelivery.updateMany({ where: { id: delivery.id }, data: { sentAt: now, error: null } }); sent++;
        } catch (error) {
          const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          if ([404, 410].includes(status)) { await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } }); break; }
          await prisma.pushDelivery.updateMany({ where: { id: delivery.id }, data: { error: status ? `Proveedor push: HTTP ${status}` : "No se pudo conectar con el proveedor push." } }); failed++;
        }
      }
    }
  }
  await prisma.pushDelivery.deleteMany({ where: { ...(options.userIds ? { subscription: { userId: { in: options.userIds } } } : {}), attemptedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
  return { sent, failed };
}
