/**
 * Long-running agent worker: drains the bus continuously, with no serverless
 * time limit. Run next to the web app (Fly / Railway / a VM) with the same
 * MONGO_URI and OPENAI_API_KEY:
 *
 *   npm run worker
 *
 * Vercel's cron keeps enqueueing flows (tick?flow=…); this process does the
 * long work (scout chunks, embeddings, research, authoring) so the web tier
 * never has to. Safe to run alongside the cron-driven drain: the bus claims
 * each message atomically.
 */
import "dotenv/config";
import { processQueue } from "../src/app/lib/agents";

const BUDGET_MS = parseInt(process.env.WORKER_BUDGET_MS || "", 10) || 10 * 60_000;
const IDLE_MS = parseInt(process.env.WORKER_IDLE_MS || "", 10) || 15_000;
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  console.log(`[worker] up — budget ${BUDGET_MS / 1000}s per pass, idle ${IDLE_MS / 1000}s`);
  while (!stopping) {
    try {
      const r = await processQueue({ budgetMs: BUDGET_MS });
      if (r.handled || r.failed) console.log(`[worker] handled ${r.handled}, failed ${r.failed}, remaining ${r.remaining}`);
      if (!r.remaining) await new Promise((res) => setTimeout(res, IDLE_MS));
    } catch (e) {
      console.error("[worker] pass failed:", (e as Error)?.message);
      await new Promise((res) => setTimeout(res, IDLE_MS));
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
})();
