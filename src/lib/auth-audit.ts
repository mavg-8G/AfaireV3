import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "./prisma";

type AuditContext = { requestId: string; recorded: boolean; accountRef?: string; clientRef?: string };
export const authAuditContext = new AsyncLocalStorage<AuditContext>();
export type AuthAuditInput = {
  outcome: "SUCCESS" | "REJECTED" | "ERROR";
  reason: "LOGIN_SUCCESS" | "PROXY_IP_MISSING" | "PROXY_IP_INVALID" | "IP_RATE_LIMIT" | "ACCOUNT_RATE_LIMIT" | "INVALID_INPUT" | "ACCOUNT_NOT_FOUND" | "PASSWORD_MISMATCH" | "PASSWORD_CHANGED" | "BACKEND_ERROR" | "CSRF_REJECTED" | "ORIGIN_REJECTED" | "CALLBACK_REJECTED";
  stage: "PROXY" | "VALIDATION" | "RATE_LIMIT" | "PASSWORD" | "SESSION" | "CALLBACK";
  errorCode?: string;
};
// HMAC prevents offline guessing of email/IP references from leaked audit rows.
const processKey = randomUUID();
export function authReference(kind: "account" | "client", value: string) {
  const normalized = kind === "account" ? value.trim().toLowerCase() : value;
  return createHmac("sha256", process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? processKey).update(`${kind}:${normalized}`).digest("hex");
}
export function safeAuthErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^(P\d{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)$/.test(code) ? code : "UNEXPECTED_ERROR";
}
export function setAuthAuditAccount(email: string) {
  const context = authAuditContext.getStore();
  if (context) context.accountRef = authReference("account", email);
}
export function makeAuthAuditEvent(input: AuthAuditInput, context = authAuditContext.getStore()) {
  // Explicit allowlist: never spread request bodies, headers, errors or user records.
  return {
    id: randomUUID(), occurredAt: new Date(), requestId: context?.requestId ?? randomUUID(),
    outcome: input.outcome, reason: input.reason, stage: input.stage,
    accountRef: context?.accountRef ?? null, clientRef: context?.clientRef ?? null,
    errorCode: input.errorCode ? safeAuthErrorCode({ code: input.errorCode }) : null,
  };
}
export async function recordAuthAudit(input: AuthAuditInput, persist = (event: ReturnType<typeof makeAuthAuditEvent>) => prisma.authAuditEvent.create({ data: event }) as Promise<unknown>) {
  const context = authAuditContext.getStore();
  if (context) context.recorded = true;
  const event = makeAuthAuditEvent(input, context);
  const line = JSON.stringify({ service: "afaire-web", event: "AUTH_LOGIN", ...event });
  if (input.outcome === "SUCCESS") console.log(line);
  else if (input.outcome === "ERROR") console.error(line);
  else console.warn(line);
  try { await persist(event); }
  catch (error) {
    // An audit storage failure must not revoke or reject an otherwise valid login.
    console.error(JSON.stringify({ service: "afaire-web", event: "AUTH_AUDIT_WRITE_FAILED", requestId: event.requestId, errorCode: safeAuthErrorCode(error) }));
  }
}

/** Covers pre-authorize failures such as CSRF, as well as unexpected callback errors. */
export async function auditLoginRequest(request: Request, run: () => Promise<Response>) {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/api/auth/callback/credentials") return run();
  const address = request.headers.get("x-afaire-client-ip");
  const clientRef = process.env.TRUST_PROXY === "true" && address && isIP(address) ? authReference("client", address) : undefined;
  return authAuditContext.run({ requestId: randomUUID(), recorded: false, clientRef }, async () => {
    try {
      const response = await run();
      if (!authAuditContext.getStore()!.recorded) {
        let location = response.headers.get("location");
        if (!location && response.headers.get("content-type")?.includes("application/json")) {
          try { const body = await response.clone().json(); location = typeof body?.url === "string" ? body.url : null; } catch { /* classify as unknown rejection */ }
        }
        const csrf = location ? new URL(location, request.url).searchParams.get("csrf") === "true" : false;
        await recordAuthAudit({ outcome: "REJECTED", reason: csrf ? "CSRF_REJECTED" : "CALLBACK_REJECTED", stage: "CALLBACK" });
      }
      response.headers.set("X-Afaire-Request-ID", authAuditContext.getStore()!.requestId);
      return response;
    } catch (error) {
      await recordAuthAudit({ outcome: "ERROR", reason: "BACKEND_ERROR", stage: "CALLBACK", errorCode: safeAuthErrorCode(error) });
      // Do not let exception messages containing connection strings reach the client.
      return Response.json({ error: "No se pudo iniciar sesión." }, { status: 500, headers: { "X-Afaire-Request-ID": authAuditContext.getStore()!.requestId } });
    }
  });
}
