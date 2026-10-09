import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { PasswordFormSchema } from "../src/lib/definitions";
import { withUserLock } from "../src/lib/transaction";
import readline from "node:readline";

async function readPassword() {
  if (!process.stdin.isTTY) throw new Error("Ejecuta el comando en un terminal interactivo.");
  process.stdout.write("Nueva contraseña (no se mostrará): ");
  readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const handler = (text: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") { cleanup(); reject(new Error("Cancelado.")); return; }
      if (key.name === "return") { cleanup(); process.stdout.write("\n"); resolve(value); }
      else if (key.name === "backspace") value = value.slice(0, -1);
      else if (text && !key.ctrl && !/[\r\n\x1b]/.test(text)) value += text;
    };
    function cleanup() { process.stdin.off("keypress", handler); process.stdin.setRawMode(false); process.stdin.pause(); }
    process.stdin.on("keypress", handler);
  });
}
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: npm run account:reset -- usuario@ejemplo.com");
  const password = await readPassword();
  PasswordFormSchema.parse({ currentPassword: "reset", newPassword: password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 12);
  await withUserLock(user.id, async tx => { await tx.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.deviceSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }); });
  console.log("Contraseña actualizada; todas las sesiones anteriores quedan invalidadas.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Error"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
