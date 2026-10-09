"use server";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { NotificationSchema, SubscriptionSchema } from "@/lib/notifications";
import type { ActionResult } from "@/lib/definitions";
import { revalidatePath } from "next/cache";
export async function saveNotificationSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = NotificationSchema.safeParse({ ...Object.fromEntries(formData), upcoming: formData.get("upcoming") === "on", dailySummary: formData.get("dailySummary") === "on", dueTomorrow: formData.get("dueTomorrow") === "on", quietEnabled: formData.get("quietEnabled") === "on" });
  if (!result.success) return { error: "Revisa las horas y los minutos de antelación." };
  try {
    await withUserLock(user.id, async tx => { await tx.notificationSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...result.data }, update: result.data }); });
    revalidatePath("/settings"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function addPushSubscription(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const result = SubscriptionSchema.safeParse(input);
  if (!result.success) return { error: "El navegador devolvió una suscripción push inválida o un proveedor no compatible." };
  try {
    await withUserLock(user.id, async tx => {
      const current = await tx.pushSubscription.findUnique({ where: { endpoint: result.data.endpoint } });
      if (current && current.userId !== user.id) throw new DomainError("Desactiva los avisos de la cuenta anterior en este dispositivo antes de activarlos.");
      if (!current && await tx.pushSubscription.count({ where: { userId: user.id } }) >= 5) throw new DomainError("Ya tienes cinco dispositivos. Desactiva uno antes de añadir otro.");
      const data = { p256dh: result.data.keys.p256dh, auth: result.data.keys.auth, sessionVersion: user.sessionVersion, deviceSessionId: user.currentSessionId };
      await tx.pushSubscription.upsert({ where: { endpoint: result.data.endpoint }, create: { userId: user.id, endpoint: result.data.endpoint, ...data }, update: data });
      await tx.notificationSettings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    }); revalidatePath("/settings"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => { await tx.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } }); });
    revalidatePath("/settings"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function removeAllPushSubscriptions(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => { await tx.pushSubscription.deleteMany({ where: { userId: user.id } }); });
    revalidatePath("/settings"); return { ok: true };
  } catch (error) { return actionError(error); }
}
