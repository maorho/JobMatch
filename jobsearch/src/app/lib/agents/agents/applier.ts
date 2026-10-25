import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { autoApplyForUser } from "@/app/lib/apply/autoApply";

export const applierAgent = registerAgent({
  name: "applier",
  title: "Applier",
  description: "Applies on the candidate's behalf when a posting clears their auto-apply bar: tailors the résumé, fills the ATS form, and reports what needs a human.",
  handles: ["apply.request"],
  async handle(msg, ctx) {
    const p = msg.payload as Payloads["apply.request"];
    // Per posting: tailoring + two form runs can take minutes, so renew the lease each time.
    const r = await autoApplyForUser(p.userId, p.jobs, { heartbeat: ctx.heartbeat });
    if (r.disabled) return "Auto-apply is off for this candidate — did nothing.";
    if (r.featureOff && r.held) {
      // This runtime has no apply server: the postings were parked (deferred rows), not dropped.
      ctx.log(`⏸ auto-apply is switched off in this runtime (FEATURE_AUTO_APPLY / PUPPETEER_SERVER_URL) — ${r.held} external posting${r.held === 1 ? "" : "s"} parked as deferred for a runtime that has the apply server`);
    }
    for (const s of r.submitted) ctx.log(`✅ ${s.title} @ ${s.company} (${s.score}%)`);
    for (const n of r.needsUser) ctx.log(`✋ ${n.title} @ ${n.company}: ${n.reason}`);
    if (r.deferred) ctx.log(`⏳ ${r.deferred} deferred: the apply server was unavailable — retried automatically with backoff (1h, 2h, 4h…), given up after a few tries`);
    if (r.failed) ctx.log(`❌ ${r.failed} failed (no form found / rejected) — see the auto-apply log`);
    // Report whenever something happened the person should know about, failures and deferrals included.
    if (r.submitted.length || r.needsUser.length || r.failed || r.deferred) {
      await ctx.send(
        "apply.report",
        { userId: p.userId, submitted: r.submitted, needsUser: r.needsUser, failed: r.failed, capped: r.capped, deferred: r.deferred },
        `${r.submitted.length} submitted, ${r.needsUser.length} need the candidate${r.failed ? `, ${r.failed} failed` : ""}${r.deferred ? `, ${r.deferred} deferred (apply server unavailable)` : ""}${r.capped ? `, ${r.capped} held for tomorrow (daily cap)` : ""}. Notifier — let them know.`
      );
    }
    return `Considered ${p.jobs.length}${p.trigger === "retry" ? " (+ due retries)" : ""}: ${r.submitted.length} submitted, ${r.needsUser.length} need the candidate, ${r.failed} failed, ${r.deferred} deferred, ${r.skipped} skipped${r.capped ? `, ${r.capped} over the daily cap` : ""}.`;
  },
});
