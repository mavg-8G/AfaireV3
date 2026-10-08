"use server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { SignupFormSchema, PasswordFormSchema, type AuthFormState } from "@/lib/definitions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { allowAttempt, allowClientAttempt } from "@/lib/access";
import { withUserLock } from "@/lib/transaction";

export async function signup(formData: FormData): Promise<AuthFormState> {
  if (!await allowClientAttempt((await headers()).get("x-afaire-client-ip") ?? undefined, "signup")) return { message: "Demasiados intentos de registro. Espera 15 minutos." };
  const parsed = SignupFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if ((process.env.REGISTRATION_MODE ?? "invite") === "invite") {
    const expected = Buffer.from(process.env.REGISTRATION_CODE ?? "");
    const provided = Buffer.from(String(formData.get("inviteCode") ?? ""));
    if (!expected.length || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return { message: "Código de invitación inválido." };
  }
  if (!await allowAttempt(`signup:${parsed.data.email}`, 5)) return { message: "Demasiados intentos. Espera 15 minutos." };
  try {
    await prisma.user.create({ data: {
      email: parsed.data.email, name: parsed.data.name, timezone: parsed.data.timezone,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      availability: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: "08:00", end: "22:00", active: true })) },
    } });
    return { ok: true };
  } catch { return { message: "No se pudo crear la cuenta. Si ya tienes una, inicia sesión." }; }
}
export async function changePassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await requireUser();
  if (!await allowClientAttempt((await headers()).get("x-afaire-client-ip") ?? undefined, "password")) return { message: "Demasiados intentos. Espera 15 minutos." };
  const parsed = PasswordFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!await allowAttempt(`password:${user.id}`)) return { message: "Demasiados intentos. Espera 15 minutos." };
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!await bcrypt.compare(parsed.data.currentPassword, record.passwordHash)) return { message: "La contraseña actual no coincide." };
  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await withUserLock(user.id, async tx => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (current.passwordHash !== record.passwordHash) throw new Error("Contraseña modificada en otra sesión.");
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash, sessionVersion: { increment: 1 } } });
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Contraseña actualizada. Inicia sesión de nuevo." };
}
