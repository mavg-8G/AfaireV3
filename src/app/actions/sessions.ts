"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError } from "@/lib/transaction";
import { revokeDevices } from "@/lib/device-sessions";
import type { ActionResult } from "@/lib/definitions";
export async function closeSession(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try { await withUserLock(user.id, tx => revokeDevices(tx, user.id, user.currentSessionId, id)); revalidatePath("/", "layout"); return { ok: true }; } catch (error) { return actionError(error); }
}
export async function closeOtherSessions(): Promise<ActionResult> {
  return closeSession("OTHERS");
}
