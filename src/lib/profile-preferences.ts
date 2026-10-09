import type { Prisma } from "@prisma/client";
import { PreferencesSchema, type Preferences } from "./locale";
import { clearPendingHabitBlocks } from "./weekly-habits";
export async function updateRegionalPreferences(tx: Prisma.TransactionClient, userId: string, input: Preferences, now = new Date()) {
 const preferences = PreferencesSchema.parse(input);
 const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
 if (current.weekStartsOn !== preferences.weekStartsOn) for (const habit of await tx.habit.findMany({ where: { userId, frequencyMode: "WEEKLY" } })) await clearPendingHabitBlocks(tx, userId, habit.id, now);
 await tx.user.update({ where: { id: userId }, data: preferences });
}
