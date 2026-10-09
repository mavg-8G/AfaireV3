/* Public shell plus one authenticated, expiring, read-only snapshot. Never cache HTML or mutations. */
const CACHE_NAME = "afaire-public-v4";
const DAY_CACHE = "afaire-day-v1";
let snapshotGeneration = 0;
const PUBLIC_ASSETS = ["/offline.html", "/offline.css", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/maskable-512.png", "/pwa/apple-touch-icon.png"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of PUBLIC_ASSETS) {
      const response = await fetch(new Request(path, { cache: "reload", credentials: "omit" }));
      if (!response.ok || response.redirected || response.type !== "basic") throw new Error("Public asset unavailable");
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith("afaire-public-") && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (["/login", "/register"].includes(url.pathname)) event.waitUntil(clearDay());
    event.respondWith(fetch(request).then(async response => {
      if ([401, 403].includes(response.status) || (response.redirected && new URL(response.url).pathname === "/login")) await clearDay();
      return response;
    }).catch(async () => {
      if (url.pathname === "/") {
        const snapshot = await readDay();
        if (snapshot && (!url.searchParams.has("date") || url.searchParams.get("date") === snapshot.day)) return offlineDay(snapshot);
      }
      const cache = await caches.open(CACHE_NAME);
      return await cache.match("/offline.html") || Response.error();
    }));
    return;
  }
  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) || fetch(request);
    })());
  }
});

async function clearDay() { snapshotGeneration++; await caches.delete(DAY_CACHE); }
async function readDay() {
  const cache = await caches.open(DAY_CACHE); const response = await cache.match("/api/offline-today");
  if (!response) return null;
  try {
    const snapshot = await response.json();
    if (!snapshot.owner || !Array.isArray(snapshot.events) || !Number.isFinite(Date.parse(snapshot.expiresAt)) || Date.now() >= Date.parse(snapshot.expiresAt)) { await clearDay(); return null; }
    return snapshot;
  } catch { await clearDay(); return null; }
}
function offlineDay(snapshot) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const en = snapshot.locale === "en", lang = en ? "en" : "es", theme = ["light", "dark"].includes(snapshot.theme) ? snapshot.theme : "system";
  const labels = en ? { DONE: "Completed", SKIPPED: "Skipped", PENDING: "Pending", IN_PROGRESS: "In progress" } : { DONE: "Completado", SKIPPED: "Omitido", PENDING: "Pendiente", IN_PROGRESS: "En curso" };
  const rows = snapshot.events.map(e => '<li><strong>' + escape(e.start) + ' – ' + escape(e.end) + ' · ' + escape(e.title) + '</strong><p>' + escape(labels[e.status] || e.status) + (e.location ? ' · ' + escape(e.location) : '') + '</p></li>').join("");
  let saved = snapshot.savedAt;
  try { saved = new Intl.DateTimeFormat(lang, { timeZone: snapshot.timezone, dateStyle: "medium", timeStyle: "short", hourCycle: snapshot.hourFormat === "12" ? "h12" : "h23" }).format(new Date(snapshot.savedAt)); } catch { /* Legacy copies may omit locale fields. */ }
  return new Response('<!doctype html><html lang="' + lang + '" data-theme="' + theme + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + (en ? 'Today offline' : 'Hoy sin conexión') + ' · Afaire</title><link rel="stylesheet" href="/offline.css"></head><body><main><p class="eyebrow">' + (en ? 'Offline · read only' : 'Sin conexión · solo lectura') + '</p><h1>' + (en ? 'Your planner today' : 'Tu agenda de hoy') + '</h1><p>' + escape(snapshot.day) + ' · ' + escape(snapshot.timezone) + '</p><p class="note">' + (en ? 'Last copy: ' : 'Última copia: ') + escape(saved) + (en ? '. There may be newer changes.' : '. Puede haber cambios posteriores.') + '</p><ul>' + (rows || (en ? '<li>No saved blocks.</li>' : '<li>No hay bloques guardados.</li>')) + '</ul><a href="/">' + (en ? 'Reconnect →' : 'Volver a conectar →') + '</a></main></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
self.addEventListener("message", event => {
  if (!event.source || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === "CLEAR_DAY") event.waitUntil(clearDay().then(() => event.ports?.[0]?.postMessage({ ok: true })));
  if (event.data?.type === "REFRESH_DAY") event.waitUntil((async () => {
    const generation = snapshotGeneration;
    try {
      const response = await fetch(new Request("/api/offline-today", { cache: "no-store", credentials: "same-origin" }));
      if ([401, 403].includes(response.status) || response.redirected) { await clearDay(); return; }
      if (!response.ok || generation !== snapshotGeneration) return;
      const data = await response.clone().json();
      if (!data.owner || !Array.isArray(data.events) || Date.parse(data.expiresAt) <= Date.now()) return;
      const cache = await caches.open(DAY_CACHE);
      if (generation === snapshotGeneration) await cache.put("/api/offline-today", response);
    } catch { /* Keep the last unexpired snapshot on connection failure. */ }
  })());
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data; try { data = event.data?.json(); } catch { return; }
    if (!data || typeof data.title !== "string") return;
    await self.registration.showNotification(data.title.slice(0, 160), { body: String(data.body || "").slice(0, 300), icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png", tag: data.key, data: { url: data.url } });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    let url = new URL("/", self.location.origin);
    try { const target = new URL(event.notification.data?.url || "/", self.location.origin); if (target.origin === url.origin) url = target; } catch {}
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) if (new URL(client.url).origin === url.origin) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
