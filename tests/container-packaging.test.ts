import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const tempRoot = path.join(root, ".local-db");
mkdirSync(tempRoot, { recursive: true });
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
async function bundle(entry: string, directory: string) {
  const result = await build({ entryPoints: [path.join(root, entry)], outfile: path.join(directory, "entry.cjs"), platform: "node", format: "cjs", bundle: true, minify: true, external: ["@prisma/client"], metafile: true });
  for (const output of Object.values(result.metafile!.outputs)) for (const dependency of output.imports) {
    assert.ok(dependency.path === "@prisma/client" || builtins.has(dependency.path.replace(/^node:/, "")), `Unexpected runtime dependency: ${dependency.path}`);
  }
}

test("bundled worker starts and shuts down with only Prisma installed", async () => {
  const directory = mkdtempSync(path.join(tempRoot, "worker-package-test-"));
  try {
    await bundle("scripts/worker.ts", directory);
    const prisma = path.join(directory, "node_modules/@prisma/client"); mkdirSync(prisma, { recursive: true });
    writeFileSync(path.join(prisma, "index.js"), `exports.PrismaClient = class {
      constructor() { setTimeout(() => process.emit('SIGTERM'), 1000); }
      user = { findMany: async () => [] };
      workerRun = { deleteMany: async () => ({count:0}) };
      usageSample = this.workerRun;
      accessAttempt = this.workerRun;
      offlineMutation = this.workerRun;
      workerHeartbeat = { upsert: async () => { console.log('heartbeat written'); setImmediate(() => process.emit('SIGTERM')); } };
      async $disconnect() { console.log('connection closed'); }
    }; exports.Prisma = {};`);
    const result = spawnSync(process.execPath, ["entry.cjs"], { cwd: directory, timeout: 15000, encoding: "utf8", env: { ...process.env, AUTH_SECRET: "container-test-secret-with-more-than-32-characters", NEXTAUTH_URL: "http://localhost:3000", DATABASE_URL: "postgresql://test:test-password@127.0.0.1:1/test", REGISTRATION_MODE: "open", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout); assert.match(result.stderr, /base de datos no disponible/); assert.doesNotMatch(result.stdout, /heartbeat written/); assert.match(result.stdout, /connection closed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("bundled administrative commands work without tsx, bcryptjs or web-push installed", async () => {
  const directory = mkdtempSync(path.join(tempRoot, "admin-package-test-"));
  try {
    await bundle("scripts/generate-push-keys.mjs", directory);
    const keys = spawnSync(process.execPath, ["entry.cjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(keys.status, 0, keys.stderr);
    assert.match(keys.stdout, /VAPID_PUBLIC_KEY=[A-Za-z0-9_-]{87}/); assert.match(keys.stdout, /VAPID_PRIVATE_KEY=[A-Za-z0-9_-]{43}/);
    await bundle("scripts/reset-password.ts", directory);
    const prisma = path.join(directory, "node_modules/@prisma/client"); mkdirSync(prisma, { recursive: true });
    writeFileSync(path.join(prisma, "index.js"), "exports.PrismaClient = class { async $disconnect() {} }; exports.Prisma = {};");
    const reset = spawnSync(process.execPath, ["entry.cjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(reset.status, 1); assert.match(reset.stderr, /Uso: npm run account:reset/); assert.doesNotMatch(reset.stderr, /Cannot find module/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("migration pruning keeps pinned Prisma dependencies and removes build/application packages", () => {
  const directory = mkdtempSync(path.join(tempRoot, "migrate-package-test-"));
  try {
    const original = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    for (const name of ["package.json", "package-lock.json"]) writeFileSync(path.join(directory, name), readFileSync(path.join(root, name)));
    const prepare = spawnSync(process.execPath, [path.join(root, "scripts/container-package.mjs")], { cwd: directory, encoding: "utf8" }); assert.equal(prepare.status, 0, prepare.stderr);
    const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    const prune = spawnSync(process.execPath, [npm, "prune", "--omit=dev", "--ignore-scripts", "--offline", "--package-lock-only", "--no-audit", "--no-fund"], { cwd: directory, encoding: "utf8", timeout: 30000 }); assert.equal(prune.status, 0, prune.stderr);
    const lock = JSON.parse(readFileSync(path.join(directory, "package-lock.json"), "utf8"));
    assert.equal(lock.packages["node_modules/prisma"].version, original.devDependencies.prisma);
    assert.equal(lock.packages["node_modules/@prisma/client"].version, original.dependencies["@prisma/client"]);
    assert.equal(lock.packages["node_modules/prisma"].dev, undefined);
    for (const name of ["next", "react", "typescript", "tsx", "eslint", "embedded-postgres", "esbuild"]) assert.equal(lock.packages[`node_modules/${name}`], undefined, name);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
