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
import path from "path";
import dotenv from "dotenv";
// The Next app's env (same file server/index.ts loads), then anything in a plain .env.
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config();
import { validateEnv } from "../src/app/lib/env";
import { processQueue } from "../src/app/lib/agents";
import { FEATURES } from "../src/app/lib/flags";
import type { MessageType } from "../src/app/lib/agents/types";

/**
 * One pass = one `processQueue` call with this budget. The bus stops claiming
 * new messages at the budget and hands every handler `ctx.deadline`, so a
 * pass never runs materially past it even when a single message is long.
 */
const BUDGET_MS = parseInt(process.env.WORKER_BUDGET_MS || "", 10) || 10 * 60_000;
const IDLE_MS = parseInt(process.env.WORKER_IDLE_MS || "", 10) || 15_000;
/** A broken worker (bad Mongo URI, lost network) must crash so the supervisor restarts it, not spin quietly. */
const MAX_CONSECUTIVE_FAILURES = 5;
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  validateEnv(); // throws in production on a bad env; logs elsewhere
  console.log(`[worker] up — budget ${BUDGET_MS / 1000}s per pass, idle ${IDLE_MS / 1000}s`);
  let failures = 0;
  let warnedNoApply = false;
  while (!stopping) {
    try {
      // Without an apply server here, apply requests must stay queued for a runtime that has
      // one (the Vercel tick): claiming them would only park every posting as deferred.
      // Read every pass: FEATURES is lazy, so a flipped env applies without a restart.
      const skipTypes: MessageType[] = FEATURES.autoApply ? [] : ["apply.request"];
      if (skipTypes.length && !warnedNoApply) {
        warnedNoApply = true;
        console.warn("[worker] auto-apply is OFF in this worker's env (FEATURE_AUTO_APPLY / PUPPETEER_SERVER_URL unset) — leaving apply.request messages queued for a runtime that has the apply server");
      }
      const r = await processQueue({ budgetMs: BUDGET_MS, skipTypes });
      failures = 0;
      if (r.handled || r.failed) console.log(`[worker] handled ${r.handled}, failed ${r.failed}, remaining ${r.remaining}`);
      if (!r.remaining) await new Promise((res) => setTimeout(res, IDLE_MS));
    } catch (e) {
      failures++;
      console.error(`[worker] pass failed (${failures}/${MAX_CONSECUTIVE_FAILURES}):`, (e as Error)?.message);
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        console.error("[worker] giving up after consecutive failures — exiting so the supervisor restarts me");
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, IDLE_MS));
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
})();
