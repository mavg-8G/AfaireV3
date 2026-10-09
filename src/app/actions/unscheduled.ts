"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { actionError, withUserLock } from "@/lib/transaction";
import { resolveUnscheduledInTransaction } from "@/lib/resolve-unscheduled";
import type { ActionResult } from "@/lib/definitions";

export async function resolveUnscheduled(day: string, key: string, actionIndex: number, planVersion: number): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, tx => resolveUnscheduledInTransaction(tx, user.id, day, key, actionIndex, planVersion));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) { return actionError(error); }
}
