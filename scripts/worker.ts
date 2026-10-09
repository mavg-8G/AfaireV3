import "dotenv/config";
import { runPushNotifications } from "../src/lib/push";
import { runDuePlans } from "../src/lib/planner";
import { prisma } from "../src/lib/prisma";
import { validateRuntimeEnvironment } from "../src/lib/security";
validateRuntimeEnvironment(process.env);

let stopping = false; let wake: (() => void) | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { stopping = true; wake?.(); });
async function main() {
  let delay = 60_000;
  while (!stopping) {
    try {
      let processFailed = false;
      for (const [kind, run] of [["PLAN", runDuePlans], ["PUSH", runPushNotifications]] as const) {
        try { const result = await run(); if (Object.values(result).some(value => value > 0)) console.log(JSON.stringify({ time: new Date().toISOString(), kind, ...result })); }
        catch { processFailed = true; console.error(JSON.stringify({ time: new Date().toISOString(), kind, message: "Proceso fallido; se reintentará en el siguiente ciclo." })); }
      }
      delay = processFailed ? Math.min(delay * 2, 300_000) : 60_000;
    } catch {
      console.error("Worker: base de datos no disponible, se reintentará.");
      delay = Math.min(delay * 2, 300_000);
    }
    if (!stopping) await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, delay);
      wake = () => { clearTimeout(timer); resolve(); };
    });
  }
  await prisma.$disconnect();
}
main().catch(() => { process.exitCode = 1; });
