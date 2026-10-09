import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { DomainError, withUserLock } from "./transaction";
export const SESSION_LIFETIME_MS = 7 * 86400_000;
export function deviceLabel(agent: string | undefined) {
  const ua = (agent ?? "").slice(0, 1024);
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const platform = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Dispositivo desconocido";
  return browser + " · " + platform;
}
export async function createDeviceSession(tx: Prisma.TransactionClient, userId: string, agent?: string, now = new Date()) {
  await tx.pushSubscription.deleteMany({ where: { userId, deviceSession: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } } });
  await tx.deviceSession.deleteMany({ where: { userId, OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } });
  return tx.deviceSession.create({ data: { id: randomBytes(32).toString("hex"), userId, label: deviceLabel(agent), createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS) } });
}
export async function validDeviceSession(userId: string, id: string | undefined, version: number, now = new Date()) {
  if (!id) return false;
  const device = await prisma.deviceSession.findFirst({ where: { id, userId, revokedAt: null, expiresAt: { gt: now }, user: { sessionVersion: version } } });
  if (!device) return false;
  if (device.lastSeenAt.getTime() < now.getTime() - 300_000) await prisma.deviceSession.updateMany({ where: { id, userId, revokedAt: null, expiresAt: { gt: now }, lastSeenAt: { lt: new Date(now.getTime() - 300_000) } }, data: { lastSeenAt: now } });
  return true;
}
export async function revokeDevices(tx: Prisma.TransactionClient, userId: string, currentId: string, target: string | "OTHERS", now = new Date()) {
  const current = await tx.deviceSession.findFirst({ where: { id: currentId, userId, revokedAt: null, expiresAt: { gt: now } } });
  if (!current) throw new DomainError("Tu sesión caducó. Inicia sesión de nuevo.");
  const where = { userId, ...(target === "OTHERS" ? { id: { not: currentId } } : { id: target }), revokedAt: null };
  if (target !== "OTHERS" && !await tx.deviceSession.findFirst({ where })) throw new DomainError("Sesión no encontrada.");
  const devices = await tx.deviceSession.findMany({ where, select: { id: true } });
  await tx.pushSubscription.deleteMany({ where: { userId, OR: [{ deviceSessionId: { in: devices.map(d => d.id) } }, ...(target === "OTHERS" ? [{ deviceSessionId: null }] : [])] } });
  await tx.deviceSession.updateMany({ where, data: { revokedAt: now } });
}
export async function revokeOnLogout(userId: string, id: string) {
  await withUserLock(userId, async tx => {
    await tx.pushSubscription.deleteMany({ where: { userId, deviceSessionId: id } });
    await tx.deviceSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
}
