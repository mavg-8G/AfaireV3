import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import manifest from "../src/app/manifest";
const origin = "https://agenda.example.com";
function harness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>(); const writes: string[] = []; const credentials: string[] = [];
  let disconnected = false; let status = 200; let snapshot: unknown; let refreshGate: Promise<void> | undefined;
  const notices: { title: string; options: { tag: string } }[] = []; const opened: string[] = [];
  class LocalRequest extends Request { constructor(input: string | Request, init?: RequestInit) { super(typeof input === "string" ? new URL(input, origin) : input, init); } }
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { async put(path: string, response: Response) { writes.push(path); store.set(path, response.clone()); }, async match(path: string) { return store.get(path)?.clone(); } };
    }, async keys() { return [...stores.keys()]; }, async delete(name: string) { return stores.delete(name); },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { origin }, addEventListener: (name: string, cb: (event: unknown) => void) => handlers.set(name, cb), skipWaiting: async () => {}, registration: { showNotification: async (title: string, options: { tag: string }) => { notices.push({ title, options }); } }, clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } } },
    caches, URL, Request: LocalRequest, Response,
    fetch: async (input: Request) => {
      if (disconnected) throw new Error("Disconnected");
      credentials.push(input.credentials);
      if (input.url.endsWith("/api/offline-today")) { await refreshGate; return Response.json(snapshot, { status }); }
      const response = new Response(input.url.endsWith("/offline.html") ? "Generic offline screen" : "Private agenda", { status });
      Object.defineProperty(response, "type", { value: "basic" }); return response;
    },
  });
  async function lifecycle(name: string) { let pending: Promise<void> | undefined; handlers.get(name)!({ waitUntil: (value: Promise<void>) => { pending = value; } }); await pending; }
  async function request(path: string, mode = "navigate", method = "GET") {
    let pending: Promise<Response> | undefined;
    handlers.get("fetch")!({ waitUntil: () => {}, request: { url: new URL(path, origin).href, mode, method }, respondWith: (value: Promise<Response>) => { pending = value; } });
    return pending ? await pending : undefined;
  }
  async function message(type: string, sourceOrigin = origin) { let pending: Promise<void> | undefined; handlers.get("message")!({ source: { url: sourceOrigin + "/" }, data: { type }, waitUntil: (value: Promise<void>) => { pending = value; } }); await pending; }
  async function push(data: unknown) { let pending: Promise<void> | undefined; handlers.get("push")!({ data: { json: () => data }, waitUntil: (value: Promise<void>) => { pending = value; } }); await pending; }
  async function click(url: string) { let pending: Promise<void> | undefined; handlers.get("notificationclick")!({ notification: { close: () => {}, data: { url } }, waitUntil: (value: Promise<void>) => { pending = value; } }); await pending; }
  return { lifecycle, request, message, push, click, notices, opened, writes, credentials, stores, snapshot: (value: unknown) => { snapshot = value; }, pauseRefresh: () => { let release!: () => void; refreshGate = new Promise<void>(resolve => { release = resolve; }); return release; }, offline: () => { disconnected = true; }, status: (value: number) => { status = value; } };
}
test("worker precaches only public assets without session cookies", async () => {
  const h = harness(); await h.lifecycle("install");
  assert.equal(h.writes.length, 6); assert.ok(h.writes.every(path => path.startsWith("/pwa/") || /^\/offline\.(html|css)$/.test(path)));
  assert.ok(h.credentials.every(value => value === "omit"));
});
test("private navigation is never cached and disconnection returns generic content", async () => {
  const h = harness(); await h.lifecycle("install"); const before = [...h.writes];
  assert.equal(await (await h.request("/settings"))!.text(), "Private agenda");
  assert.deepEqual(h.writes, before);
  h.offline(); const response = await h.request("/inbox");
  assert.equal(await response!.text(), "Generic offline screen"); assert.deepEqual(h.writes, before);
});
test("API, mutations, external origins and query strings bypass public cache", async () => {
  const h = harness(); await h.lifecycle("install");
  for (const [path, mode, method] of [["/api/auth/session", "cors", "GET"], ["/api/activity", "cors", "POST"], ["/", "navigate", "POST"], ["https://evil.invalid/offline.html", "navigate", "GET"], ["/pwa/icon-192.png?private=yes", "cors", "GET"]]) assert.equal(await h.request(path, mode, method), undefined);
  assert.equal(h.writes.length, 6);
});
test("authentication failures remain failures instead of offline pages", async () => {
  const h = harness(); await h.lifecycle("install"); h.status(401);
  assert.equal((await h.request("/settings"))!.status, 401);
});
test("worker activation removes only old Afaire public caches", async () => {
  const h = harness(); await h.lifecycle("install");
  h.stores.set("afaire-public-v0", new Map()); h.stores.set("another-application", new Map());
  await h.lifecycle("activate");
  assert.equal(h.stores.has("afaire-public-v0"), false); assert.equal(h.stores.has("another-application"), true);
});
test("manifest icons exist with valid PNG sizes and maskable purpose", () => {
  const m = manifest(); assert.equal(m.display, "standalone"); assert.equal(m.scope, "/");
  assert.ok(m.icons!.some(icon => icon.purpose === "maskable"));
  for (const icon of m.icons!) {
    const bytes = readFileSync(`public${icon.src}`); const size = Number(icon.sizes!.split("x")[0]);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
});

const daySnapshot = () => ({ owner: "account-a", day: "2026-10-08", timezone: "America/Guayaquil", savedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(), events: [{ title: '<img src=x onerror="alert(1)">', start: "09:00", end: "10:00", status: "PENDING", location: "Home" }] });
test("only an explicit authenticated snapshot is cached and offline HTML escapes private titles", async () => {
  const h = harness(); await h.lifecycle("install"); h.snapshot(daySnapshot());
  await h.message("REFRESH_DAY", "https://evil.invalid"); assert.equal(h.stores.has("afaire-day-v1"), false);
  await h.message("REFRESH_DAY"); assert.ok(h.stores.get("afaire-day-v1")?.has("/api/offline-today"));
  h.offline(); const response = await h.request("/"); const body = await response!.text();
  assert.match(body, /solo lectura/); assert.match(body, /&lt;img/); assert.doesNotMatch(body, /<img src=x|<form|<script/);
  assert.equal(await (await h.request("/?date=2026-10-09"))!.text(), "Generic offline screen");
  assert.equal(await (await h.request("/settings"))!.text(), "Generic offline screen");
});
test("expired snapshots are deleted and logout cannot race a refresh into restoring private data", async () => {
  const h = harness(); await h.lifecycle("install"); h.snapshot(daySnapshot()); await h.message("REFRESH_DAY");
  h.stores.get("afaire-day-v1")!.set("/api/offline-today", Response.json({ ...daySnapshot(), expiresAt: new Date(0).toISOString() }));
  h.offline(); assert.equal(await (await h.request("/"))!.text(), "Generic offline screen"); assert.equal(h.stores.has("afaire-day-v1"), false);
  const other = harness(); other.snapshot(daySnapshot()); const release = other.pauseRefresh(); const pending = other.message("REFRESH_DAY");
  await other.message("CLEAR_DAY"); release(); await pending; assert.equal(other.stores.has("afaire-day-v1"), false);
});
test("invalid sessions clear the snapshot and push clicks cannot navigate off-site", async () => {
  const h = harness(); h.snapshot(daySnapshot()); await h.message("REFRESH_DAY"); h.status(401); await h.message("REFRESH_DAY"); assert.equal(h.stores.has("afaire-day-v1"), false);
  await h.push({ key: "event:1", title: "Next block", body: "Class", url: "/" }); assert.equal(h.notices[0].options.tag, "event:1");
  await h.click("https://evil.invalid/"); assert.deepEqual(h.opened, [origin + "/"]);
});

test("offline snapshot keeps language, clock strings and explicit theme without translating private titles",async()=>{
 const h=harness();await h.lifecycle("install");h.snapshot({...daySnapshot(),locale:"en",hourFormat:"12",theme:"dark",events:[{title:"Contraseña",start:"09:00 AM",end:"10:00 AM",status:"DONE",location:"Home"}]});await h.message("REFRESH_DAY");h.offline();const body=await(await h.request("/"))!.text();assert.match(body,/lang="en"/);assert.match(body,/data-theme="dark"/);assert.match(body,/read only/);assert.match(body,/09:00 AM/);assert.match(body,/Completed/);assert.match(body,/Contraseña/);assert.doesNotMatch(body,/<script|<form/);
});
