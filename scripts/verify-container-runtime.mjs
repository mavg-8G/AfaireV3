import { access, readdir, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const require = createRequire(path.join(root, "package.json"));
for (const name of ["@prisma/client/runtime/client", "@prisma/adapter-pg", "pg"]) {
  const relative = path.relative(root, require.resolve(name));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Runtime dependency resolved outside the package: ${name}`);
}
async function keepFiles(directory, keep) {
  const relative = path.relative(await realpath(root), await realpath(directory));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Refusing to trim dependencies outside the runtime package.");
  for (const name of await readdir(directory)) if (!keep.has(name)) await rm(path.join(directory, name), { recursive: true, force: true });
}
// Prisma 7 uses a PostgreSQL query compiler and the JS driver adapter.
// Keep its runtime and compiler files, without the unused database compilers.
const packageDirectory = path.join(root, "node_modules/@prisma/client");
await keepFiles(packageDirectory, new Set(["package.json", "LICENSE", "runtime"]));
const runtimeDirectory = path.join(packageDirectory, "runtime");
const runtimeFiles = await readdir(runtimeDirectory);
const keep = new Set(runtimeFiles.filter(name => /^(client\.|index-browser\.|query_compiler_fast_bg\.postgresql\.)/.test(name)));
await keepFiles(runtimeDirectory, keep);
for (const name of ["server.js", "dist/worker.cjs", "dist/prisma-client.cjs"]) await access(path.join(root, name));
require("@prisma/client/runtime/query_compiler_fast_bg.postgresql.js");
const { wasm } = require("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js");
await WebAssembly.compile(Buffer.from(wasm, "base64"));
const { createPrismaClient } = require(path.join(root, "dist/prisma-client.cjs"));
await createPrismaClient().$disconnect();
for (const name of ["typescript", "eslint", "prisma", "embedded-postgres", "esbuild"]) {
  try { await access(path.join(root, "node_modules", name)); }
  catch { continue; }
  throw new Error(`Build-only dependency present in the runtime package: ${name}`);
}
console.log("Standalone server, bundled worker and Prisma 7 PostgreSQL adapter verified.");
