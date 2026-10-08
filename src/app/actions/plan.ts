"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { generateDay } from "@/lib/planner";
import { actionError } from "@/lib/transaction";

export async function planDay(date?: string) {
  const user = await requireUser();
  try {
    const result = await generateDay(user.id, date);
    revalidatePath("/"); revalidatePath("/week"); revalidatePath("/inbox");
    return { ...result, error: undefined };
  } catch (error) { return { placed: 0, skipped: [] as string[], ...actionError(error) }; }
}
