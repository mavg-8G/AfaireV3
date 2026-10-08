"use server";
import { revalidatePath } from "next/cache";
import { SettingsFormSchema, type ActionResult } from "@/lib/definitions";
import { requireUser } from "@/lib/dal";
import { withUserLock, actionError, DomainError } from "@/lib/transaction";
import { HABIT_TEMPLATES } from "@/lib/templates";

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const availability = Array.from({ length: 7 }, (_, weekday) => ({
    weekday, active: formData.get(`active-${weekday}`) === "on",
    start: formData.get(`start-${weekday}`), end: formData.get(`end-${weekday}`),
  }));
  const parsed = SettingsFormSchema.safeParse({
    ...Object.fromEntries(formData), availability,
    autoPlan: formData.get("autoPlan") === "on", carryOver: formData.get("carryOver") === "on",
    adaptiveDurations: formData.get("adaptiveDurations") === "on",
    adaptiveAvailability: formData.get("adaptiveAvailability") === "on",
  });
  if (!parsed.success) return { error: "Revisa horarios y zona horaria. Cada hora final debe ser posterior al inicio." };
  try {
    await withUserLock(user.id, async tx => {
      const { availability: rows, ...data } = parsed.data;
      const previous = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (previous.timezone !== data.timezone) {
        await tx.usageSample.deleteMany({ where: { userId: user.id } });
        await tx.availability.updateMany({ where: { userId: user.id }, data: { learnedWindows: [], learnedActive: null, learnedAt: null, learningReason: null } });
      }
      await tx.user.update({ where: { id: user.id }, data });
      for (const row of rows) {
        await tx.availability.upsert({ where: { userId_weekday: { userId: user.id, weekday: row.weekday } }, create: { ...row, userId: user.id }, update: row });
      }
      if (formData.get("onboarding") === "true") {
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (current.onboardingCompleted) throw new DomainError("La configuración inicial ya fue completada.");
        const selected = new Set(formData.getAll("templates").map(String));
        if (selected.size && !rows.some(row => row.active)) throw new DomainError("Activa al menos un día para crear tus rutinas iniciales.");
        for (const template of HABIT_TEMPLATES.filter(t => selected.has(t.key))) {
          const habit = { title: template.title, durationMinutes: template.durationMinutes, preferredWindow: template.preferredWindow, priority: template.priority, required: template.required };
          await tx.habit.create({ data: { ...habit, userId: user.id, daysOfWeek: rows.filter(row => row.active).map(row => row.weekday) } });
        }
        await tx.user.update({ where: { id: user.id }, data: { onboardingCompleted: true } });
      }
    });
    revalidatePath("/", "layout"); return { ok: true };
  } catch (error) { return actionError(error); }
}

export async function resetLearning(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUserLock(user.id, async tx => {
      await tx.usageSample.deleteMany({ where: { userId: user.id } });
      await tx.availability.updateMany({ where: { userId: user.id }, data: { learnedWindows: [], learnedActive: null, learnedAt: null, learningReason: null } });
    });
    revalidatePath("/", "layout"); return { ok: true };
  } catch (error) { return actionError(error); }
}
