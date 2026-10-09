import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { prisma } from "./prisma";

export class DomainError extends Error {}
export async function withUserLock<T>(userId: string, run: (tx: Prisma.TransactionClient) => Promise<T>, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    // Calendar writes share this lock, including jobs and plans on different dates.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length) throw new DomainError("Cuenta no encontrada.");
    return run(tx);
  }, { maxWait: 15_000, timeout: 30_000 });
}
export function actionError(error: unknown): { error: string; ok?: boolean } {
  if (error instanceof DomainError) return { error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2004", "P2010"].includes(error.code)) {
    return { error: "El horario entra en conflicto con otro bloque. Actualiza la agenda e inténtalo de nuevo." };
  }
  console.error("Afaire: operación fallida", error instanceof Error ? error.name : "Error");
  return { error: "No se pudo guardar. Comprueba la conexión e inténtalo de nuevo." };
}
