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
    const r = await autoApplyForUser(p.userId, p.jobs);
    if (r.disabled) return "Auto-apply is off for this candidate — did nothing.";
    for (const s of r.submitted) ctx.log(`✅ ${s.title} @ ${s.company} (${s.score}%)`);
    for (const n of r.needsUser) ctx.log(`✋ ${n.title} @ ${n.company}: ${n.reason}`);
    if (r.deferred) ctx.log(`⏳ ${r.deferred} deferred: the apply server was unavailable — they stay eligible for the next pass`);
    if (r.failed) ctx.log(`❌ ${r.failed} failed (no form found / rejected) — see the auto-apply log`);
    // Report whenever something happened the person should know about, failures and deferrals included.
    if (r.submitted.length || r.needsUser.length || r.failed || r.deferred) {
      await ctx.send(
        "apply.report",
        { userId: p.userId, submitted: r.submitted, needsUser: r.needsUser, failed: r.failed, capped: r.capped, deferred: r.deferred },
        `${r.submitted.length} submitted, ${r.needsUser.length} need the candidate${r.failed ? `, ${r.failed} failed` : ""}${r.deferred ? `, ${r.deferred} deferred (apply server unavailable)` : ""}${r.capped ? `, ${r.capped} held for tomorrow (daily cap)` : ""}. Notifier — let them know.`
      );
    }
    return `Considered ${p.jobs.length}: ${r.submitted.length} submitted, ${r.needsUser.length} need the candidate, ${r.failed} failed, ${r.deferred} deferred, ${r.skipped} skipped${r.capped ? `, ${r.capped} over the daily cap` : ""}.`;
  },
});
