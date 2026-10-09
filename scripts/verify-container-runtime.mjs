import { access, readdir, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
async function keepFiles(directory, keep) {
  const relative = path.relative(await realpath(root), await realpath(directory));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Refusing to trim dependencies outside the runtime package.");
  for (const name of await readdir(directory)) if (!keep.has(name)) await rm(path.join(directory, name), { recursive: true, force: true });
}
const clientDirectory = path.join(root, "node_modules/.prisma/client");
const files = await readdir(clientDirectory);
const engine = files.find(name => /^(libquery_engine-.+\.so\.node|query_engine-.+\.dll\.node)$/.test(name));
if (!engine) throw new Error("The standalone package is missing its native Prisma engine.");
const keep = new Set(["default.js", "index.js", "package.json", "schema.prisma", engine]);
// Type declarations, browser/WASM clients and temporary engines are not used
// by the Node.js server or worker. Remove them before the final image COPY.
await keepFiles(clientDirectory, keep);
const packageDirectory = path.join(root, "node_modules/@prisma/client");
await keepFiles(packageDirectory, new Set(["default.js", "index.js", "package.json", "LICENSE", "runtime"]));
await keepFiles(path.join(packageDirectory, "runtime"), new Set(["library.js", "library.js.map"]));
for (const name of keep) await access(path.join(clientDirectory, name));
await access(path.join(root, "server.js"));
await access(path.join(root, "dist/worker.cjs"));
const require = createRequire(path.join(root, "package.json"));
require(path.join(clientDirectory, engine)); // Also checks native system libraries.
const { PrismaClient } = require("@prisma/client");
await new PrismaClient().$disconnect();
for (const name of ["typescript", "eslint", "prisma", "embedded-postgres", "esbuild"]) {
  try { await access(path.join(root, "node_modules", name)); }
  catch { continue; }
  throw new Error(`Build-only dependency present in the runtime package: ${name}`);
}
console.log("Standalone server, bundled worker and native Prisma client verified.");
