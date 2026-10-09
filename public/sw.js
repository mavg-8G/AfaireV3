/* Public shell, authenticated day copy and an explicit session-bound change queue. */
const CACHE_NAME = "afaire-public-v6";
const DAY_CACHE = "afaire-day-v1";
const CHANGE_CACHE = "afaire-changes-v1";
const CHANGE_PATH = "/offline-changes";
let stateWork = Promise.resolve(), syncing;
function serial(run) { const result = stateWork.then(run); stateWork = result.catch(() => {}); return result; }
let snapshotGeneration = 0;
const PUBLIC_ASSETS = ["/offline.html", "/offline.css", "/offline-day.js", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/maskable-512.png", "/pwa/apple-touch-icon.png"];
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
    if (url.pathname === "/" && url.searchParams.get("offline") === "1") {
      event.respondWith((async () => {
        const snapshot = await readDay();
        const queue = await readQueue();
        if (snapshot || queue?.changes.length) return offlineDay(snapshot ?? { ...queue, events: [], day: "", savedAt: queue.changes[0].recordedAt });
        return await (await caches.open(CACHE_NAME)).match("/offline.html") || fetch(request);
      })());
      return;
    }
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

async function clearDay() { snapshotGeneration++; await serial(async () => { await caches.delete(DAY_CACHE); await caches.delete(CHANGE_CACHE); }); }
async function readDay() {
  const cache = await caches.open(DAY_CACHE); const response = await cache.match("/api/offline-today");
  if (!response) return null;
  try {
    const snapshot = await response.json();
    if (!snapshot.owner || !Array.isArray(snapshot.events) || !Number.isFinite(Date.parse(snapshot.expiresAt))) { await clearDay(); return null; }
    if (Date.now() >= Date.parse(snapshot.expiresAt)) { await serial(() => caches.delete(DAY_CACHE)); return null; }
    return snapshot;
  } catch { await clearDay(); return null; }
}
function offlineDay(snapshot) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const en = snapshot.locale === "en", lang = en ? "en" : "es", theme = ["light", "dark"].includes(snapshot.theme) ? snapshot.theme : "system";
  const labels = en ? { DONE: "Completed", SKIPPED: "Skipped", PENDING: "Pending", IN_PROGRESS: "In progress" } : { DONE: "Completado", SKIPPED: "Omitido", PENDING: "Pendiente", IN_PROGRESS: "En curso" };
  const editable = Boolean(snapshot.deviceSessionId);
  const rows = snapshot.events.map(e => '<li><strong>' + escape(e.start) + ' – ' + escape(e.end) + ' · ' + escape(e.title) + '</strong><p>' + escape(labels[e.status] || e.status) + (e.location ? ' · ' + escape(e.location) : '') + '</p></li>').join("");
  let saved = snapshot.savedAt;
  try { saved = new Intl.DateTimeFormat(lang, { timeZone: snapshot.timezone, dateStyle: "medium", timeStyle: "short", hourCycle: snapshot.hourFormat === "12" ? "h12" : "h23" }).format(new Date(snapshot.savedAt)); } catch { /* Legacy copies may omit locale fields. */ }
  return new Response('<!doctype html><html lang="' + lang + '" data-theme="' + theme + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + (en ? 'Today offline' : 'Hoy sin conexión') + ' · Afaire</title><link rel="stylesheet" href="/offline.css">' + (editable ? '<script src="/offline-day.js" defer></script>' : '') + '</head><body><main><p class="eyebrow">' + (editable ? (en ? 'Saved planner · local changes' : 'Agenda guardada · cambios locales') : (en ? 'Offline · read only' : 'Sin conexión · solo lectura')) + '</p><h1>' + (en ? 'Your planner today' : 'Tu agenda de hoy') + '</h1><p>' + escape(snapshot.day) + ' · ' + escape(snapshot.timezone) + '</p><p class="note">' + (en ? 'Last copy: ' : 'Última copia: ') + escape(saved) + (en ? '. There may be newer changes.' : '. Puede haber cambios posteriores.') + '</p><p id="sync-status" role="status" aria-live="polite"></p><section id="queued-changes"></section><ul id="offline-events">' + (rows || (en ? '<li>No saved blocks.</li>' : '<li>No hay bloques guardados.</li>')) + '</ul><a href="/">' + (en ? 'Return to planner →' : 'Volver a la agenda →') + '</a></main></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
async function readQueue() {
  const response = await (await caches.open(CHANGE_CACHE)).match(CHANGE_PATH);
  if (!response) return null;
  try { const queue = await response.json(); return queue.owner && Array.isArray(queue.changes) ? queue : null; } catch { return null; }
}
async function saveQueue(queue) { await (await caches.open(CHANGE_CACHE)).put(CHANGE_PATH, Response.json(queue)); }
function sameSession(a, b) { return a.owner === b.owner && a.deviceSessionId === b.deviceSessionId && a.sessionVersion === b.sessionVersion; }
async function queueState() {
  const snapshot = await readDay(), queue = await readQueue();
  return { snapshot, changes: queue?.changes ?? [], locale: snapshot?.locale ?? queue?.locale ?? "es", pending: queue?.changes.length ?? 0, conflicts: queue?.changes.filter(c => c.error).length ?? 0 };
}
async function notifyQueue(applied = 0) {
  const state = await queueState();
  for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) client.postMessage({ type: "CHANGE_QUEUE_UPDATE", pending: state.pending, conflicts: state.conflicts, applied });
}
async function enqueueChange(input) {
  const snapshot = await readDay();
  if (!snapshot?.deviceSessionId || !sameSession(input, snapshot)) throw new Error("La copia no pertenece a esta sesión o ya caducó.");
  const generation = snapshotGeneration;
  await serial(async () => {
    if (generation !== snapshotGeneration) throw new Error("La sesión cambió.");
    const event = snapshot.events.find(row => row.id === input.eventId);
    if (!event || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id) || !["EDIT", "STATUS"].includes(input.kind)) throw new Error("Cambio inválido.");
    const queue = await readQueue() ?? { owner: snapshot.owner, deviceSessionId: snapshot.deviceSessionId, sessionVersion: snapshot.sessionVersion, locale: snapshot.locale, timezone: snapshot.timezone, theme: snapshot.theme, changes: [] };
    if (!sameSession(queue, snapshot)) throw new Error("La cola pertenece a otra sesión.");
    if (queue.changes.some(row => row.id === input.id)) return;
    if (queue.changes.length >= 200) throw new Error("La cola está llena. Sincroniza o descarta cambios antes de continuar.");
    if (queue.changes.some(row => row.eventId === input.eventId && row.error)) throw new Error("Este bloque tiene un conflicto pendiente. Descarta sus cambios antes de editarlo.");
    const { kind, status, edit } = input;
    const acknowledged = queue.versions?.[event.id];
    const visibleVersion = Number.isFinite(Date.parse(input.expectedUpdatedAt)) ? input.expectedUpdatedAt : event.updatedAt;
    const version = acknowledged && Date.parse(acknowledged) > Date.parse(visibleVersion) ? acknowledged : visibleVersion;
    const change = { id: input.id, owner: snapshot.owner, deviceSessionId: snapshot.deviceSessionId, sessionVersion: snapshot.sessionVersion, eventId: event.id, expectedUpdatedAt: version, recordedAt: new Date().toISOString(), timezone: snapshot.timezone, kind, ...(kind === "STATUS" ? { status } : { edit }) };
    queue.changes.push({ ...change, title: event.title });
    await saveQueue(queue);
  });
  await notifyQueue();
  try { await self.registration.sync?.register("afaire-changes"); } catch { /* Foreground reconnect also drains the queue. */ }
}
async function refreshDay() {
  const generation = snapshotGeneration;
  try {
    const response = await fetch(new Request("/api/offline-today", { cache: "no-store", credentials: "same-origin" }));
    if ([401, 403].includes(response.status) || response.redirected) { await clearDay(); return null; }
    if (!response.ok || generation !== snapshotGeneration) return null;
    const data = await response.clone().json();
    if (!data.owner || !Array.isArray(data.events) || Date.parse(data.expiresAt) <= Date.now()) return null;
    await serial(async () => {
      if (generation !== snapshotGeneration) return;
      const queue = await readQueue();
      if (queue && !sameSession(queue, data)) await caches.delete(CHANGE_CACHE);
      await (await caches.open(DAY_CACHE)).put("/api/offline-today", response);
    });
    return generation === snapshotGeneration ? data : null;
  } catch { return null; }
}
function syncChanges() {
  if (syncing) return syncing;
  syncing = drainChanges().finally(() => { syncing = undefined; });
  return syncing;
}
async function drainChanges() {
  const snapshot = await refreshDay();
  if (!snapshot) return;
  const generation = snapshotGeneration;
  let applied = 0;
  const attempted = new Set();
  while (generation === snapshotGeneration) {
    const queue = await readQueue();
    if (!queue || !sameSession(queue, snapshot)) break;
    const blocked = new Set(queue.changes.filter(c => c.error).map(c => c.eventId));
    const entry = queue.changes.find(c => !c.error && !blocked.has(c.eventId) && !attempted.has(c.id));
    if (!entry) break;
    attempted.add(entry.id);
    const { title, error, ...change } = entry;
    void title; void error;
    let response, result;
    try {
      response = await fetch(new Request("/api/offline-changes", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }));
      if ([401, 403].includes(response.status) || response.redirected) { await clearDay(); break; }
      if (response.status >= 500 || response.status === 429) break;
      result = await response.json();
      if (response.ok && (!result.ok || result.eventId !== change.eventId || !Number.isFinite(Date.parse(result.updatedAt)))) break;
    } catch { break; }
    await serial(async () => {
      if (generation !== snapshotGeneration) return;
      const latest = await readQueue();
      if (!latest || !sameSession(latest, snapshot)) return;
      const index = latest.changes.findIndex(c => c.id === entry.id);
      if (index < 0) return;
      if (response.ok) {
        latest.versions ??= {};
        latest.versions[entry.eventId] = result.updatedAt;
        latest.changes.splice(index, 1);
        for (const following of latest.changes.slice(index)) if (following.eventId === entry.eventId && following.expectedUpdatedAt === entry.expectedUpdatedAt) following.expectedUpdatedAt = result.updatedAt;
        applied++;
      } else latest.changes[index].error = String(result.error ?? "El cambio no pudo aplicarse.").slice(0, 500);
      await saveQueue(latest);
    });
  }
  if (generation === snapshotGeneration) {
    await refreshDay();
    const current = await readDay();
    await serial(async () => {
      if (generation !== snapshotGeneration) return;
      const queue = await readQueue();
      if (queue?.versions && current) {
        const retained = new Set([...current.events.map(e => e.id), ...queue.changes.map(c => c.eventId)]);
        queue.versions = Object.fromEntries(Object.entries(queue.versions).filter(([id]) => retained.has(id)));
        await saveQueue(queue);
      }
    });
    await notifyQueue(applied);
  }
}
self.addEventListener("message", event => {
  if (!event.source || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === "CLEAR_DAY") event.waitUntil(clearDay().then(() => event.ports?.[0]?.postMessage({ ok: true })));
  if (["REFRESH_DAY", "SYNC_CHANGES"].includes(event.data?.type)) event.waitUntil(syncChanges().then(() => event.ports?.[0]?.postMessage({ ok: true })));
  if (event.data?.type === "GET_OFFLINE_STATE") event.waitUntil(queueState().then(state => event.ports?.[0]?.postMessage({ ok: true, ...state })));
  if (event.data?.type === "QUEUE_CHANGE") event.waitUntil(enqueueChange(event.data.change).then(() => event.ports?.[0]?.postMessage({ ok: true })).catch(error => event.ports?.[0]?.postMessage({ error: error.message })));
  if (event.data?.type === "DISCARD_EVENT_CHANGES") event.waitUntil((async () => {
    await serial(async () => {
      const queue = await readQueue();
      if (!queue || queue.owner !== event.data.owner || queue.deviceSessionId !== event.data.deviceSessionId) return;
      // Do not discard in-flight commands: an acknowledgement may still be lost.
      if (syncing) throw new Error("Espera a que termine la sincronización.");
      queue.changes = queue.changes.filter(c => c.eventId !== event.data.eventId);
      await saveQueue(queue);
    });
    await notifyQueue(); event.ports?.[0]?.postMessage({ ok: true });
  })().catch(error => event.ports?.[0]?.postMessage({ error: error.message })));
});
self.addEventListener("sync", event => { if (event.tag === "afaire-changes") event.waitUntil(syncChanges()); });
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
