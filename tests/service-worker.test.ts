import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import manifest from "../src/app/manifest";
const origin = "https://agenda.example.com";
function harness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>(); const writes: string[] = []; const credentials: string[] = [];
  let disconnected = false; let status = 200;
  class LocalRequest extends Request { constructor(input: string | Request, init?: RequestInit) { super(typeof input === "string" ? new URL(input, origin) : input, init); } }
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { async put(path: string, response: Response) { writes.push(path); store.set(path, response.clone()); }, async match(path: string) { return store.get(path)?.clone(); } };
    }, async keys() { return [...stores.keys()]; }, async delete(name: string) { return stores.delete(name); },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { origin }, addEventListener: (name: string, cb: (event: unknown) => void) => handlers.set(name, cb), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, URL, Request: LocalRequest, Response,
    fetch: async (input: Request) => {
      if (disconnected) throw new Error("Disconnected");
      credentials.push(input.credentials);
      const response = new Response(input.url.endsWith("/offline.html") ? "Generic offline screen" : "Private agenda", { status });
      Object.defineProperty(response, "type", { value: "basic" }); return response;
    },
  });
  async function lifecycle(name: string) { let pending: Promise<void> | undefined; handlers.get(name)!({ waitUntil: (value: Promise<void>) => { pending = value; } }); await pending; }
  async function request(path: string, mode = "navigate", method = "GET") {
    let pending: Promise<Response> | undefined;
    handlers.get("fetch")!({ request: { url: new URL(path, origin).href, mode, method }, respondWith: (value: Promise<Response>) => { pending = value; } });
    return pending ? await pending : undefined;
  }
  return { lifecycle, request, writes, credentials, stores, offline: () => { disconnected = true; }, status: (value: number) => { status = value; } };
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
