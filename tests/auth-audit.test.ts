import test from "node:test";
import assert from "node:assert/strict";
import { authReference, makeAuthAuditEvent, safeAuthErrorCode } from "../src/lib/auth-audit";

test("audit events use an allowlist and never serialize credentials, headers or error messages", () => {
  const input = { outcome: "REJECTED" as const, reason: "PASSWORD_MISMATCH" as const, stage: "PASSWORD" as const, password: "private-password", cookie: "private-cookie", errorCode: "secret-connection-string" };
  const event = makeAuthAuditEvent(input, { requestId: "request-1", recorded: false, accountRef: "opaque" });
  assert.equal(event.requestId, "request-1");
  assert.equal(event.errorCode, "UNEXPECTED_ERROR");
  assert.doesNotMatch(JSON.stringify(event), /private-password|private-cookie|secret-connection-string/);
  assert.equal(safeAuthErrorCode({ code: "P2021", message: "password=secret" }), "P2021");
  assert.equal(safeAuthErrorCode(new Error("password=secret")), "UNEXPECTED_ERROR");
});

test("account references normalize email and are separate from client references", () => {
  assert.equal(authReference("account", " Person@Example.com "), authReference("account", "person@example.com"));
  assert.notEqual(authReference("client", "person@example.com"), authReference("account", "person@example.com"));
  assert.match(authReference("account", "person@example.com"), /^[a-f0-9]{64}$/);
});
