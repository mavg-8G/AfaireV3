import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ymdInZone, addLocalDays, dateOnly } from "../src/lib/time";
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
  const englishLogin = await fetch(new URL("/login", base), { headers: { cookie: "afaire-locale=en; afaire-theme=dark" } }); const englishHtml = await englishLogin.text();
  check("Login en inglés, tema oscuro y nombre accesible del idioma", () => { assert.match(englishHtml, /lang="en"/); assert.match(englishHtml, /data-theme="dark"/); assert.match(englishHtml, /Your planner awaits/); assert.match(englishHtml, /aria-label="Language"/); });
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
  const measuredTask = await prisma.task.create({ data: { userId: ids[0], title: `Medición ${stamp}`, durationMinutes: 40 } });
  for (let i = 1; i <= 3; i++) await prisma.event.create({ data: { userId: ids[0], taskId: measuredTask.id, title: measuredTask.title, source: "AUTO", status: "DONE", actualMinutes: 60, estimatedMinutes: 40, startsAt: new Date(Date.now() - i * 86400_000), endsAt: new Date(Date.now() - i * 86400_000 + 40 * 60000) } });
  await prisma.workerRun.create({ data: { userId: ids[0], date: new Date("2030-04-15T00:00Z"), kind: "PUSH", status: "FAILED", message: "Proveedor push: HTTP 503" } });
  await prisma.task.create({ data: { userId: ids[0], title: "Plazo en riesgo", durationMinutes: 480, dueDate: dateOnly(addLocalDays(ymdInZone(new Date(), "America/Guayaquil"), -1)) } });
  const authA = await login(emailA, password); const authB = await login(emailB, password);
  const inboxA = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authA.jar) } }); const bodyA = await inboxA.text();
  const inboxB = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authB.jar) } }); const bodyB = await inboxB.text();
  check("Aislamiento entre cuentas y escape de contenido HTML", () => {
    assert.equal(inboxA.status, 200); assert.equal(inboxB.status, 200);
    assert.ok(bodyA.includes(titleA)); assert.ok(!bodyB.includes(titleA)); assert.ok(!bodyA.includes(stamp + "')"));
    assert.ok(bodyB.includes("&lt;img")); assert.ok(!bodyB.includes(titleB));
  });
  check("Bandeja muestra energía y estimación sugerida con evidencia", () => { assert.match(bodyA, /Ligera/); assert.match(bodyA, /Duración sugerida/); assert.match(bodyA, /Aplicar estimación sugerida/); assert.match(bodyA, /Tareas recurrentes flexibles/); assert.match(bodyA, /Plantillas de tareas/); assert.match(bodyA, /Ver cómo cambiaría el plan/); assert.match(bodyA, /name="categoryId"/); });
  const offlineAnonymous = await fetch(new URL("/api/offline-today", base));
  check("Copia offline requiere sesión", () => assert.equal(offlineAnonymous.status, 401));
  const offlineA = await fetch(new URL("/api/offline-today", base), { headers: { cookie: cookieHeader(authA.jar) } });
  const snapshotA = await offlineA.json() as { owner: string; expiresAt: string; events: { title: string }[] };
  check("Copia del día privada, con caducidad y aislada por cuenta", () => { assert.equal(offlineA.status, 200); assert.match(offlineA.headers.get("cache-control") ?? "", /no-store/); assert.equal(snapshotA.owner, ids[0]); assert.ok(Date.parse(snapshotA.expiresAt) > Date.now()); assert.ok(snapshotA.events.some(e => e.title === titleA)); assert.ok(!snapshotA.events.some(e => e.title === titleB)); });
  for (const path of ["/", "/habits", "/review", "/settings", "/week", "/check-in"]) {
    const page = await fetch(new URL(path, base), { headers: { cookie: cookieHeader(authA.jar) } });
    check("Página autenticada disponible: " + path, () => assert.equal(page.status, 200));
    const content = await page.text();
    if (path === "/settings") check("Silencio y observabilidad push visibles", () => { assert.match(content, /Horas de silencio/); assert.match(content, /name="quietStart"/); assert.match(content, /Proveedor push: HTTP 503/); assert.match(content, /Vacaciones y días especiales/); assert.match(content, /name="slackPercent"/); assert.match(content, /Plantilla de semana/); });
    if (path === "/settings") check("Header compacto y activación push coherente con el servidor", () => {
      const header = /<header[^>]*>([\s\S]*?)<\/header>/.exec(content)?.[1] ?? "";
      assert.match(header, /aria-label="Cuenta de Prueba HTTP"/); assert.match(header, /<details/);
      assert.match(header, /href="\/settings#sessions"/); assert.match(content, /id="sessions"/);
      assert.doesNotMatch(header, /UN DÍA A LA VEZ/);
      const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
      if (configured) { assert.match(content, /Activa este dispositivo y acepta el permiso/); assert.doesNotMatch(content, /Los avisos aún no están habilitados/); }
      else assert.match(content, /Los avisos aún no están habilitados/);
      if (process.env.VAPID_PRIVATE_KEY) assert.ok(!content.includes(process.env.VAPID_PRIVATE_KEY));
    });
    if (path === "/") check("Explicación, capacidad y riesgo visibles", () => { assert.match(content, /¿Por qué este bloque está aquí/); assert.match(content, /Día difícil/); assert.match(content, /Carga y fechas en riesgo/); });
    if (path === "/check-in") check("Chequeo de fin de día accesible y privado", () => { assert.match(content, /Qué pasó hoy/); assert.match(content, /Guardar chequeo del día/); assert.match(content, /name="mood"/); assert.match(page.headers.get("cache-control") ?? "", /no-store/); });
    if (path === "/settings") check("Objetivos por categoría configurables", () => { assert.match(content, /Presupuesto de tiempo por categoría/); assert.match(content, /name="weeklyHours"/); });
    if (path === "/") check("Chequeo y feedback disponibles desde la agenda", () => { assert.match(content, /href="\/check-in\?date=/); assert.match(content, /Este plan no me sirvió/); });
    if (path === "/habits") check("Frecuencia semanal disponible", () => assert.match(content, /name="frequencyMode"/));
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
  const secondA = await login(emailA, password);
  const currentA = await prisma.deviceSession.findFirstOrThrow({ where: { userId: ids[0] }, orderBy: { createdAt: "asc" } });
  const otherA = await prisma.deviceSession.findFirstOrThrow({ where: { userId: ids[0], id: { not: currentA.id } } });
  await prisma.user.update({ where: { id: ids[0] }, data: { locale: "en", hourFormat: "12", weekStartsOn: 0 } });
  const englishAgenda = await fetch(new URL("/", base), { headers: { cookie: cookieHeader(authA.jar) } }); const englishAgendaHtml = await englishAgenda.text();
  check("Preferencias de cuenta prevalecen sobre cookies y formatos de inputs se conservan", () => { assert.match(englishAgendaHtml, /lang="en"/); assert.match(englishAgendaHtml, /Difficult day/); assert.match(englishAgendaHtml, /Skip to content/); assert.match(englishAgendaHtml, /id="main-content"/); assert.match(englishAgendaHtml, /[AP]M/); const inputs = [...englishAgendaHtml.matchAll(/<input[^>]*type="time"[^>]*>/g)]; assert.ok(inputs.length); for (const [input] of inputs) { const value = /value="([^"]*)"/.exec(input)?.[1]; if (value) assert.match(value, /^\d{2}:\d{2}$/); } });
  const englishSettings = await fetch(new URL("/settings", base), { headers: { cookie: cookieHeader(secondA.jar) } }); const englishSettingsHtml = await englishSettings.text();
  check("Sesiones y preferencias visibles en el segundo dispositivo", () => { assert.match(englishSettingsHtml, /Active sessions/); assert.match(englishSettingsHtml, /Sign out other devices/); assert.match(englishSettingsHtml, /First day of the week/); });
  await prisma.deviceSession.update({ where: { id: otherA.id }, data: { revokedAt: new Date() } });
  const revoked = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(secondA.jar) }, redirect: "manual" });
  const revokedOffline = await fetch(new URL("/api/offline-today", base), { headers: { cookie: cookieHeader(secondA.jar) } });
  check("Cookie revocada no permite leer agenda ni copia privada", () => { assert.equal(revoked.status, 307); assert.equal(revokedOffline.status, 401); });
  const cookieBeforeLogout = cookieHeader(authA.jar);
  const signout = await fetch(new URL("/api/auth/signout", base), {
    method: "POST", headers: { origin: base.origin, cookie: cookieHeader(authA.jar) }, body: new URLSearchParams({ csrfToken: authA.csrfToken, json: "true", callbackUrl: base.origin }),
  });
  collectCookies(signout, authA.jar);
  check("Logout elimina la sesión y vuelve a proteger la agenda", () => assert.ok(signout.headers.getSetCookie().some(cookie => /next-auth\.session-token=;/.test(cookie))));
  const afterLogout = await fetch(new URL("/inbox", base), { headers: { cookie: cookieHeader(authA.jar) }, redirect: "manual" });
  assert.equal(afterLogout.status, 307);
  const replayLogout = await fetch(new URL("/inbox", base), { headers: { cookie: cookieBeforeLogout }, redirect: "manual" });
  check("La cookie copiada antes de salir tampoco permite recuperar la sesión", () => assert.equal(replayLogout.status, 307));
  console.log(`${checks} comprobaciones HTTP correctas.`);
} finally {
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
