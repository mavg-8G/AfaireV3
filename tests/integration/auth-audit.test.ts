import "dotenv/config";
import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import { authOptions } from "../../src/lib/auth";
import { prisma } from "../../src/lib/prisma";
import { auditLoginRequest, authAuditContext, authReference, recordAuthAudit } from "../../src/lib/auth-audit";

const requests: string[] = [], users: string[] = [], keys: string[] = [];
const provider = authOptions.providers[0] as CredentialsConfig & { options: CredentialsConfig };
const authorize = provider.options.authorize;
const previousTrust = process.env.TRUST_PROXY;
after(async () => {
  if (previousTrust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previousTrust;
  await prisma.authAuditEvent.deleteMany({ where: { requestId: { in: requests } } });
  await prisma.accessAttempt.deleteMany({ where: { key: { in: keys } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
const hashKey = (key: string) => { const hash = createHash("sha256").update(key).digest("hex"); keys.push(hash); return hash; };
async function attempt(email: string, password: string, address?: string) {
  hashKey(`login:${email}`);
  if (address) hashKey(`client:login:${address}`);
  return auditLoginRequest(new Request("http://localhost/api/auth/callback/credentials", { method: "POST", headers: address ? { "x-afaire-client-ip": address } : {} }), async () => {
    requests.push(authAuditContext.getStore()!.requestId);
    const user = await authorize({ email, password }, { headers: address ? { "x-afaire-client-ip": address } : {}, method: "POST" });
    if (user) await authOptions.events!.signIn!({ user, account: { provider: "credentials", type: "credentials", providerAccountId: user.id } });
    return Response.json({ ok: !!user });
  });
}
async function latest() { return prisma.authAuditEvent.findFirstOrThrow({ where: { requestId: requests.at(-1)! } }); }

test("proxy rejections and CSRF are persisted before credential validation", async () => {
  process.env.TRUST_PROXY = "true";
  await attempt("person@example.invalid", "private-password");
  assert.equal((await latest()).reason, "PROXY_IP_MISSING");
  await attempt("person@example.invalid", "private-password", "spoofed, 127.0.0.1");
  assert.equal((await latest()).reason, "PROXY_IP_INVALID");
  await auditLoginRequest(new Request("http://localhost/api/auth/callback/credentials", { method: "POST" }), async () => {
    requests.push(authAuditContext.getStore()!.requestId);
    return Response.json({ url: "http://localhost/api/auth/signin?csrf=true" });
  });
  assert.equal((await latest()).reason, "CSRF_REJECTED");
});

test("password mismatch, unknown account, rate limits and successful sessions have distinct audit reasons", async () => {
  process.env.TRUST_PROXY = "false";
  const email = `${randomUUID()}@test.invalid`, password = randomUUID();
  const user = await prisma.user.create({ data: { email, name: "Audit", passwordHash: await bcrypt.hash(password, 4) } }); users.push(user.id);
  await attempt(email, "wrong-password");
  const rejected = await latest();
  assert.equal(rejected.reason, "PASSWORD_MISMATCH");
  assert.equal(rejected.accountRef, authReference("account", email));
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(email));
  await attempt(`${randomUUID()}@test.invalid`, "wrong-password");
  assert.equal((await latest()).reason, "ACCOUNT_NOT_FOUND");
  await attempt(email, password);
  assert.equal((await latest()).reason, "LOGIN_SUCCESS");
  assert.equal(await prisma.deviceSession.count({ where: { userId: user.id } }), 1);
  const key = hashKey(`login:${email}`);
  await prisma.accessAttempt.update({ where: { key }, data: { count: 10 } });
  await attempt(email, password);
  assert.equal((await latest()).reason, "ACCOUNT_RATE_LIMIT");
  process.env.TRUST_PROXY = "true";
  const address = "2001:db8:" + randomUUID().slice(0, 4) + "::2";
  const clientKey = hashKey(`client:login:${address}`);
  await prisma.accessAttempt.create({ data: { key: clientKey, count: 40, expiresAt: new Date(Date.now() + 60_000) } });
  await attempt(email, password, address);
  assert.equal((await latest()).reason, "IP_RATE_LIMIT");
});

test("a broken audit database still emits a safe Docker log without rejecting successful authentication", async () => {
  const lines: string[] = [];
  const info = mock.method(console, "log", (line: string) => { lines.push(line); });
  const errors = mock.method(console, "error", (line: string) => { lines.push(line); });
  try {
    await recordAuthAudit({ outcome: "SUCCESS", reason: "LOGIN_SUCCESS", stage: "SESSION" }, async () => { throw { code: "P2021", message: "private-database-url" }; });
    assert.match(lines[0], /LOGIN_SUCCESS/);
    assert.match(lines[1], /AUTH_AUDIT_WRITE_FAILED/);
    assert.doesNotMatch(lines.join(""), /private-database-url/);
  } finally { info.mock.restore(); errors.mock.restore(); }
});

test("unexpected callback failures are persisted with a safe code and no secret in the response", async () => {
  const response = await auditLoginRequest(new Request("http://localhost/api/auth/callback/credentials", { method: "POST" }), async () => {
    requests.push(authAuditContext.getStore()!.requestId);
    throw { code: "P2021", message: "private-connection-string" };
  });
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private-connection-string/);
  assert.equal((await latest()).errorCode, "P2021");
});
