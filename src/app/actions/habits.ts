"use server";
import { revalidatePath } from "next/cache";
import { HabitFormSchema, type ActionResult } from "@/lib/definitions";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";

function parse(formData: FormData) {
  const result = HabitFormSchema.safeParse({ ...Object.fromEntries(formData), daysOfWeek: formData.getAll("daysOfWeek"), required: formData.get("required") === "on" });
  if (!result.success) throw new DomainError("Revisa duración, prioridad y días. Selecciona al menos un día.");
  return result.data;
}
export async function createHabit(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = parse(formData);
    await withUserLock(user.id, async tx => { await tx.habit.create({ data: { ...data, userId: user.id } }); });
    revalidatePath("/habits"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function updateHabit(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = parse(formData);
    await withUserLock(user.id, async tx => {
      const habit = await tx.habit.findFirst({ where: { id, userId: user.id, archived: false } });
      if (!habit) throw new DomainError("Hábito no encontrado.");
      await tx.habit.update({ where: { id }, data });
    }); revalidatePath("/habits"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function toggleHabit(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const habit = await tx.habit.findFirst({ where: { id, userId: user.id, archived: false } });
      if (!habit) throw new DomainError("Hábito no encontrado.");
      await tx.habit.update({ where: { id }, data: { active: !habit.active } });
    }); revalidatePath("/habits"); return { ok: true };
  } catch (error) { return actionError(error); }
}
export async function deleteHabit(id: string) {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      const habit = await tx.habit.findFirst({ where: { id, userId: user.id } });
      if (!habit) throw new DomainError("Hábito no encontrado.");
      const events = await tx.event.findMany({ where: { userId: user.id, habitId: id, locked: false, status: "PENDING", startsAt: { gt: new Date() } } });
      await tx.event.updateMany({ where: { id: { in: events.map(e => e.id) }, userId: user.id }, data: { status: "CANCELLED" } });
      await tx.habitOccurrence.updateMany({ where: { id: { in: events.flatMap(e => e.occurrenceId ? [e.occurrenceId] : []) }, userId: user.id }, data: { status: "SKIPPED" } });
      await tx.habit.update({ where: { id }, data: { active: false, archived: true } });
    }); revalidatePath("/habits"); revalidatePath("/"); revalidatePath("/week"); return { ok: true };
  } catch (error) { return actionError(error); }
}
