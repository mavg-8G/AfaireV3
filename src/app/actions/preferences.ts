"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { PreferencesSchema } from "@/lib/locale";
import { withUserLock, actionError } from "@/lib/transaction";
import { updateRegionalPreferences } from "@/lib/profile-preferences";
import type { ActionResult } from "@/lib/definitions";
export async function savePreferences(formData: FormData): Promise<ActionResult> {
  const user = await requireUser(); const parsed = PreferencesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa idioma, formato de hora y primer día de la semana." };
  try {
    await withUserLock(user.id, tx => updateRegionalPreferences(tx, user.id, parsed.data));
    const jar = await cookies(); const options = { path: "/", maxAge: 31536000, sameSite: "lax" as const, secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false };
    jar.set("afaire-locale", parsed.data.locale, options); jar.set("afaire-hour-format", parsed.data.hourFormat, options); jar.set("afaire-week-start", String(parsed.data.weekStartsOn), options);
    revalidatePath("/", "layout"); return { ok: true };
  } catch (error) { return actionError(error); }
}
