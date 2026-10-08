import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("db:local solo admite una conexión local.");
  const directory = path.resolve(".local-db/data");
  const pg = new EmbeddedPostgres({
    databaseDir: directory, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    port: Number(url.port || 55432), persistent: true, authMethod: "scram-sha-256",
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"], initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: message => { if (String(message).includes("FATAL") || String(message).includes("PANIC")) console.error(String(message)); }, onError: console.error,
  });
  if (!existsSync(path.join(directory, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient("postgres", "127.0.0.1"); await client.connect();
  const db = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(db)) throw new Error("Nombre de base inválido.");
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  await client.end();
  if (!result.rows.length) await pg.createDatabase(db);
  console.log("PostgreSQL local listo en 127.0.0.1:" + (url.port || 55432) + ". Ctrl+C para detener; los datos se conservan.");
  await new Promise<void>(resolve => {
    process.once("SIGINT", resolve); process.once("SIGTERM", resolve);
  });
  await pg.stop();
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Error al iniciar PostgreSQL"); process.exitCode = 1; });
