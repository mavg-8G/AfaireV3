"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { assertFree, ownedEvent, parseEvent, setEventStatus } from "@/lib/calendar";
import type { EventStatus } from "@prisma/client";
import type { ActionResult } from "@/lib/definitions";

function refresh() { revalidatePath("/"); revalidatePath("/week"); revalidatePath("/inbox"); }
export async function createLockedEvent(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const data = parseEvent(formData, user.timezone);
      await assertFree(tx, user.id, data.startsAt, data.endsAt);
      await tx.event.create({ data: { ...data, userId: user.id, locked: true, source: "MANUAL" } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function updateEventTimes(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["SKIPPED", "CANCELLED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      const data = parseEvent(formData, user.timezone);
      if (event.occurrenceId && event.planningDate?.getTime() !== data.planningDate.getTime()) throw new DomainError("Un hábito pertenece a su día. Puedes mover su hora, pero no su fecha.");
      await assertFree(tx, user.id, data.startsAt, data.endsAt, id);
      await tx.event.update({ where: { id }, data: { ...data, locked: true } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function toggleEventDone(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      await setEventStatus(tx, user.id, id, event.status === "DONE" ? "PENDING" : "DONE");
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function changeEventStatus(id: string, status: EventStatus) {
  const user = await requireUser();
  try {
    if (!["IN_PROGRESS", "SKIPPED", "PENDING"].includes(status)) throw new DomainError("Estado inválido.");
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "DONE", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya terminó.");
      await setEventStatus(tx, user.id, id, status);
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function lockEvent(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const event = await ownedEvent(tx, user.id, id);
      if (["CANCELLED", "SKIPPED"].includes(event.status)) throw new DomainError("Este bloque ya fue retirado.");
      await tx.event.update({ where: { id }, data: { locked: true } });
    }); refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function deleteEvent(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => { await setEventStatus(tx, user.id, id, "CANCELLED"); });
    refresh(); return { ok: true };
  } catch (error) { return actionError(error); }
}
