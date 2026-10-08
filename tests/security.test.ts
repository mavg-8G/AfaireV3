import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { isAllowedOrigin, contentSecurityPolicy, validateRuntimeEnvironment } from "../src/lib/security";

test("production origins require exact scheme, host and port", () => {
  const url = "https://agenda.example.com";
  assert.ok(isAllowedOrigin(url, url));
  for (const origin of [null, "null", "http://agenda.example.com", "https://evil.example.com", "https://agenda.example.com.evil.invalid", `${url}:444`, "http://127.0.0.1:3000"]) assert.equal(isAllowedOrigin(origin, url), false);
});
test("local origin aliases never allow another port or scheme", () => {
  assert.ok(isAllowedOrigin("http://127.0.0.1:3000", "http://localhost:3000"));
  assert.ok(isAllowedOrigin("http://[::1]:3000", "http://localhost:3000"));
  assert.equal(isAllowedOrigin("http://localhost:3001", "http://localhost:3000"), false);
  assert.equal(isAllowedOrigin("https://localhost:3000", "http://localhost:3000"), false);
});
test("production CSP authorizes only nonce scripts and same-origin workers", () => {
  const policy = contentSecurityPolicy("abc123==", false, true);
  assert.match(policy, /'nonce-abc123==' 'strict-dynamic'/);
  assert.match(policy, /worker-src 'self'/); assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https:|\*/);
  assert.throws(() => contentSecurityPolicy("bad'; script-src *", false, true));
  assert.doesNotMatch(contentSecurityPolicy("abcd", true, false), /upgrade-insecure-requests/);
});
const valid = { NODE_ENV: "production", AUTH_SECRET: "f".repeat(64), NEXTAUTH_URL: "https://agenda.example.com", DATABASE_URL: "postgresql://user:password@db/app", REGISTRATION_MODE: "invite", REGISTRATION_CODE: "a".repeat(32) };
test("private redirects use the configured public origin, never an untrusted host", () => {
  const previous = process.env.NEXTAUTH_URL;
  try {
    process.env.NEXTAUTH_URL = "https://afaire.espectro.uk";
    const response = proxy(new NextRequest("http://internal:3000/inbox", { headers: { host: "evil.invalid", "x-forwarded-host": "evil.invalid" } }));
    assert.equal(response.headers.get("location"), "https://afaire.espectro.uk/login");
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous;
  }
});
test("startup rejects unsafe production configuration without disclosing secrets", () => {
  validateRuntimeEnvironment(valid);
  for (const changes of [{ AUTH_SECRET: "CHANGE_TO_A_RANDOM_SECRET" }, { AUTH_SECRET: "short" }, { NEXTAUTH_URL: "http://agenda.example.com" }, { NEXTAUTH_URL: "https://user:secret@agenda.example.com" }, { NEXTAUTH_URL: "https://agenda.example.com/path" }, { REGISTRATION_CODE: undefined }, { REGISTRATION_MODE: "typo" }, { TRUST_PROXY: "yes" }]) assert.throws(() => validateRuntimeEnvironment({ ...valid, ...changes }));
  validateRuntimeEnvironment({ ...valid, NEXTAUTH_URL: "http://127.0.0.1:3000", REGISTRATION_MODE: "open", REGISTRATION_CODE: undefined });
  assert.throws(() => validateRuntimeEnvironment({ ...valid, REGISTRATION_MODE: undefined, REGISTRATION_CODE: undefined }));
});
test("proxy replaces attacker-supplied CSP nonces and prevents caching", () => {
  const request = () => new NextRequest("http://localhost:3000/login", { headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src *" } });
  const first = proxy(request()); const second = proxy(request());
  assert.match(first.headers.get("Content-Security-Policy")!, /nonce-/);
  assert.doesNotMatch(first.headers.get("Content-Security-Policy")!, /attacker/);
  assert.notEqual(first.headers.get("Content-Security-Policy"), second.headers.get("Content-Security-Policy"));
  assert.match(first.headers.get("Cache-Control")!, /no-store/);
  assert.equal(first.headers.get("X-Frame-Options"), "DENY");
});
test("proxy blocks cross-site and originless mutations before authentication", () => {
  const cases: Record<string, string>[] = [{ origin: "https://evil.invalid" }, {}, { origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }];
  for (const headers of cases) {
    assert.equal(proxy(new NextRequest("http://localhost:3000/api/auth/callback/credentials", { method: "POST", headers })).status, 403);
  }
  assert.equal(proxy(new NextRequest("http://localhost:3000/api/auth/callback/credentials", { method: "POST", headers: { origin: "http://localhost:3000" } })).status, 200);
  assert.equal(proxy(new NextRequest("http://localhost:3000/")).status, 307);
});
