import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const base = new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Esta comprobación crea cuentas temporales y solo admite un servidor local de pruebas.");
const prisma = new PrismaClient(); const ids: string[] = []; let checks = 0;
function check(message: string, assertion: () => void) { assertion(); checks++; console.log(`✓ ${message}`); }
function collectCookies(response: Response, jar: Map<string, string>) {
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const split = pair.indexOf("="); jar.set(pair.slice(0, split), pair.slice(split + 1)); }
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const csrf = await fetch(new URL("/api/auth/csrf", base)); collectCookies(csrf, jar);
  const { csrfToken } = await csrf.json() as { csrfToken: string };
  const response = await fetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST", headers: { origin: base.origin, cookie: cookieHeader(jar) },
    body: new URLSearchParams({ email, password, csrfToken, json: "true", callbackUrl: base.origin }), redirect: "manual",
  });
  collectCookies(response, jar);
  assert.ok(response.ok, `Login HTTP ${response.status}`);
  const sessionCookie = response.headers.getSetCookie().find(cookie => /(?:__Secure-)?next-auth\.session-token=/.test(cookie));
  assert.ok(sessionCookie, "No se creó una sesión.");
  check("Cookie de sesión HttpOnly y SameSite=Lax", () => { assert.match(sessionCookie, /HttpOnly/i); assert.match(sessionCookie, /SameSite=Lax/i); });
  return { jar, csrfToken };
}

async function main() {
try {
  const first = await fetch(new URL("/login", base)); const html = await first.text();
  assert.equal(first.status, 200);
  const policy = first.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]; assert.ok(nonce);
  check("Cabeceras de seguridad y caché privada", () => {
    assert.equal(first.headers.get("x-frame-options"), "DENY"); assert.equal(first.headers.get("x-content-type-options"), "nosniff");
    assert.equal(first.headers.get("cross-origin-opener-policy"), "same-origin"); assert.ok(first.headers.get("permissions-policy"));
    assert.match(first.headers.get("cache-control") ?? "", /no-store/); assert.equal(first.headers.get("x-powered-by"), null);
  });
  check("Todos los scripts de producción reciben el nonce de la CSP", () => {
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]; assert.ok(scripts.length);
    for (const script of scripts) assert.ok(script[1].includes(`nonce="${nonce}"`), "Script sin nonce");
  });
  const second = await fetch(new URL("/login", base));
  check("Nonce distinto en cada documento", () => assert.notEqual(second.headers.get("content-security-policy"), policy));
  const manifestResponse = await fetch(new URL("/manifest.webmanifest", base));
  const manifest = await manifestResponse.json() as { display: string; icons: { src: string }[] };
  check("Manifiesto instalable y público", () => { assert.equal(manifestResponse.status, 200); assert.equal(manifest.display, "standalone"); });
  for (const icon of manifest.icons) assert.equal((await fetch(new URL(icon.src, base))).status, 200);
  const worker = await fetch(new URL("/sw.js", base));
  check("Service worker sin caché HTTP y con CSP restringida", () => {
    assert.equal(worker.status, 200); assert.match(worker.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(worker.headers.get("service-worker-allowed"), "/"); assert.match(worker.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  });
  const anonymous = await fetch(new URL("/inbox", base), { redirect: "manual" });
  check("Agenda inaccesible sin sesión", () => { assert.equal(anonymous.status, 307); assert.match(anonymous.headers.get("location") ?? "", /\/login$/); });
  const stamp = randomBytes(10).toString("hex"); const password = randomBytes(24).toString("hex");
  const emailA = `http-a-${stamp}@example.invalid`; const emailB = `http-b-${stamp}@example.invalid`;
  const titleA = `Privado A ${stamp}`; const titleB = `<img src=x onerror=alert('${stamp}')>`;
  for (const [email, title] of [[emailA, titleA], [emailB, titleB]]) {
    const user = await prisma.user.create({ data: { name: "Prueba HTTP", email, passwordHash: await bcrypt.hash(password, 12), onboardingCompleted: true, events: { create: { title, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 60_000) } }, tasks: { create: { title, durationMinutes: 30 } } } });
    ids.push(user.id);
  }
  const authA = await login(emailA, password); const authB = await login(emailB, password);
  const inboxA = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authA.jar) } }); const bodyA = await inboxA.text();
  const inboxB = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authB.jar) } }); const bodyB = await inboxB.text();
  check("Aislamiento entre cuentas y escape de contenido HTML", () => {
    assert.equal(inboxA.status, 200); assert.equal(inboxB.status, 200);
    assert.ok(bodyA.includes(titleA)); assert.ok(!bodyB.includes(titleA)); assert.ok(!bodyA.includes(stamp + "')"));
    assert.ok(bodyB.includes("&lt;img")); assert.ok(!bodyB.includes(titleB));
  });
  const offlineAnonymous = await fetch(new URL("/api/offline-today", base));
  check("Copia offline requiere sesión", () => assert.equal(offlineAnonymous.status, 401));
  const offlineA = await fetch(new URL("/api/offline-today", base), { headers: { cookie: cookieHeader(authA.jar) } });
  const snapshotA = await offlineA.json() as { owner: string; expiresAt: string; events: { title: string }[] };
  check("Copia del día privada, con caducidad y aislada por cuenta", () => { assert.equal(offlineA.status, 200); assert.match(offlineA.headers.get("cache-control") ?? "", /no-store/); assert.equal(snapshotA.owner, ids[0]); assert.ok(Date.parse(snapshotA.expiresAt) > Date.now()); assert.ok(snapshotA.events.some(e => e.title === titleA)); assert.ok(!snapshotA.events.some(e => e.title === titleB)); });
  for (const path of ["/", "/habits", "/review", "/settings"]) {
    const page = await fetch(new URL(path, base), { headers: { cookie: cookieHeader(authA.jar) } });
    check("Página autenticada disponible: " + path, () => assert.equal(page.status, 200));
  }
  for (const origin of ["https://evil.invalid", null]) {
    const headers: Record<string, string> = { cookie: cookieHeader(authA.jar) }; if (origin) headers.origin = origin;
    const response = await fetch(new URL("/api/activity", base), { method: "POST", headers });
    check(`Mutación ${origin ? "de origen externo" : "sin origen"} rechazada`, () => assert.equal(response.status, 403));
  }
  const activity = await fetch(new URL("/api/activity", base), { method: "POST", headers: { origin: base.origin, cookie: cookieHeader(authA.jar) } });
  check("Actividad autenticada y del mismo origen aceptada", () => assert.equal(activity.status, 204));
  const missingCsrf = await fetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST", headers: { origin: base.origin }, body: new URLSearchParams({ email: emailA, password, json: "true" }), redirect: "manual",
  });
  check("Login sin token CSRF no emite sesión", () => assert.ok(!missingCsrf.headers.getSetCookie().some(cookie => /next-auth\.session-token=/.test(cookie))));
  const signout = await fetch(new URL("/api/auth/signout", base), {
    method: "POST", headers: { origin: base.origin, cookie: cookieHeader(authA.jar) }, body: new URLSearchParams({ csrfToken: authA.csrfToken, json: "true", callbackUrl: base.origin }),
  });
  collectCookies(signout, authA.jar);
  check("Logout elimina la sesión y vuelve a proteger la agenda", () => assert.ok(signout.headers.getSetCookie().some(cookie => /next-auth\.session-token=;/.test(cookie))));
  const afterLogout = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authA.jar) }, redirect: "manual" });
  assert.equal(afterLogout.status, 307);
  console.log(`${checks} comprobaciones HTTP correctas.`);
} finally {
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
