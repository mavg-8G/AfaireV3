import { readFile, writeFile } from "node:fs/promises";

// npm prune reuses the installed versions and lockfile from the deps stage.
// Promote the CLI to a runtime dependency and discard the application/build tree.
const original = JSON.parse(await readFile("package.json", "utf8"));
const manifest = {
  name: original.name,
  version: original.version,
  private: true,
  engines: original.engines,
  overrides: original.overrides,
  dependencies: {
    "@prisma/client": original.dependencies["@prisma/client"],
    prisma: original.devDependencies.prisma,
  },
  scripts: {
    "db:migrate": "node node_modules/prisma/build/index.js migrate deploy",
    "account:reset": "node dist/admin/reset-password.cjs",
    "push:keys": "node dist/admin/generate-push-keys.cjs",
  },
};
await writeFile("package.json", JSON.stringify(manifest, null, 2) + "\n");
