import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { builtinModules, createRequire } from "node:module";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const tempRoot = tmpdir();
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
const runtimePackages = ["@prisma/client", "@prisma/adapter-pg", "pg"];
const optionalPackages = new Set(["supports-color"]); // debug catches a missing color helper.
// Use a directory outside the checkout so missing packages cannot fall back to
// the development node_modules. Copy the actual production dependency closure.
function installRuntime(directory: string) {
  const copied = new Set<string>();
  function copy(name: string, importer: string) {
    if (copied.has(name)) return;
    const require = createRequire(importer);
    let packageDirectory: string;
    try { packageDirectory = path.dirname(require.resolve(name + "/package.json")); }
    catch { packageDirectory = path.dirname(require.resolve(name)); }
    while (!existsSync(path.join(packageDirectory, "package.json")) || JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8")).name !== name) {
      const parent = path.dirname(packageDirectory);
      assert.notEqual(parent, packageDirectory, `Cannot find package root: ${name}`);
      packageDirectory = parent;
    }
    copied.add(name);
    cpSync(packageDirectory, path.join(directory, "node_modules", name), { recursive: true });
    const manifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) copy(dependency, path.join(packageDirectory, "package.json"));
  }
  for (const name of runtimePackages) copy(name, path.join(root, "package.json"));
}
async function bundle(entry: string, directory: string, stopWorker = false) {
  const result = await build({ entryPoints: [path.join(root, entry)], outfile: path.join(directory, "entry.cjs"), platform: "node", format: "cjs", bundle: true, minify: true, external: runtimePackages, metafile: true, banner: stopWorker ? { js: "setTimeout(() => process.emit('SIGTERM'), 1000);" } : undefined });
  for (const output of Object.values(result.metafile!.outputs)) for (const dependency of output.imports) {
    assert.ok(runtimePackages.some(name => dependency.path === name || dependency.path.startsWith(name + "/")) || optionalPackages.has(dependency.path) || builtins.has(dependency.path.replace(/^node:/, "")), `Unexpected runtime dependency: ${dependency.path}`);
  }
}

test("bundled worker starts and shuts down with only its Prisma 7 runtime dependencies", async () => {
  const directory = mkdtempSync(path.join(tempRoot, "worker-package-test-"));
  try {
    await bundle("scripts/worker.ts", directory, true);
    installRuntime(directory);
    const result = spawnSync(process.execPath, ["entry.cjs"], { cwd: directory, timeout: 15000, encoding: "utf8", env: { ...process.env, AUTH_SECRET: "container-test-secret-with-more-than-32-characters", NEXTAUTH_URL: "http://localhost:3000", DATABASE_URL: "postgresql://test:test-password@127.0.0.1:1/test", REGISTRATION_MODE: "open", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout); assert.match(result.stderr, /base de datos no disponible/);
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
    installRuntime(directory);
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
    for (const name of [...runtimePackages, "dotenv"]) assert.equal(lock.packages[`node_modules/${name}`].version, original.dependencies[name]);
    assert.equal(lock.packages["node_modules/prisma"].dev, undefined);
    for (const name of ["next", "typescript", "@typescript/native", "tsx", "eslint", "embedded-postgres", "esbuild"]) assert.equal(lock.packages[`node_modules/${name}`], undefined, name);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
