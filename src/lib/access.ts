import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { isIP } from "node:net";

export async function allowClientAttempt(address: string | undefined, kind: "login" | "signup" | "password") {
  if (process.env.TRUST_PROXY !== "true") return true;
  // Only the supplied reverse proxy may set this header; it overwrites client input.
  if (!address || !isIP(address)) return false;
  return allowAttempt(`client:${kind}:${address}`, kind === "login" ? 40 : 10);
}

export async function allowAttempt(identity: string, limit = 10) {
  const key = createHash("sha256").update(identity).digest("hex");
  const now = new Date();
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AccessAttempt" (key, count, "expiresAt") VALUES (${key}, 1, ${new Date(now.getTime() + 15 * 60_000)})
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "AccessAttempt"."expiresAt" < ${now} THEN 1 ELSE "AccessAttempt".count + 1 END,
    "expiresAt" = CASE WHEN "AccessAttempt"."expiresAt" < ${now} THEN EXCLUDED."expiresAt" ELSE "AccessAttempt"."expiresAt" END
    RETURNING count`;
  return rows[0].count <= limit;
}
