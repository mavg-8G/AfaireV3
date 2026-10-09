import Client from "pg/lib/client.js";

const WORKER_LOCK_KEY = 0x41464149;
// A dedicated connection owns the session lock throughout PLAN and PUSH.
// Prisma's pool cannot safely acquire and release a session lock on separate calls.
export async function withWorkerCycleLock<T>(run: () => Promise<T>, onConnectionLost: (error: Error) => void) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, query_timeout: 10_000, keepAlive: true });
  client.on("error", onConnectionLost);
  try {
    await client.connect();
    const { rows } = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) AS acquired", [WORKER_LOCK_KEY]);
    if (!rows[0].acquired) return { acquired: false as const };
    try { return { acquired: true as const, result: await run() }; }
    finally { await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY]); }
  } finally {
    // Closing also releases the lock if the cycle or unlock query failed.
    await client.end();
  }
}
