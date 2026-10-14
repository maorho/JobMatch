import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { syncUserEmails } from "@/app/lib/email/track";
import { expireUnanswered, usersWithDuePrompts, duePrompts, markAsked } from "@/app/lib/outcomes/outcomes";
import { trainLikelihood } from "@/app/lib/matcher/likelihood";

export const trackerAgent = registerAgent({
  name: "tracker",
  title: "Tracker",
  description: "Reads the candidate's Gmail (read-only), classifies recruiter emails and moves applications to their new status; closes the outcome loop by asking candidates what happened.",
  handles: ["inbox.sync", "outcomes.ask"],
  async handle(msg, ctx) {
    if (msg.type === "outcomes.ask") {
      const p = msg.payload as Payloads["outcomes.ask"];
      const expired = await expireUnanswered();
      const model = await trainLikelihood().catch((e) => { ctx.log(`Likelihood training skipped: ${(e as Error)?.message}`); return null; });
      if (model) ctx.log(model.trained ? `Interview-likelihood model retrained on ${model.samples} outcomes (${model.positives} interviews): AUC ${model.auc}, log-loss ${model.logLoss}.` : `Interview-likelihood model: ${model.samples} outcomes so far, need ${20} — using the prior.`);
      const users = await usersWithDuePrompts(new Date(), p.limit ?? 200);
      let prompted = 0;
      let left = 0;
      for (const [i, userId] of users.entries()) {
        // Near the dispatcher's budget: stop; unasked users are still due tomorrow.
        if (Date.now() > ctx.deadline - 5_000) {
          left = users.length - i;
          ctx.log(`Out of time: ${left} candidate${left === 1 ? "" : "s"} left for the next run.`);
          break;
        }
        await ctx.heartbeat();
        const due = await duePrompts(userId);
        if (!due.replies.length && !due.questions.length) continue;
        await markAsked(due);
        await ctx.send(
          "outcome.prompt",
          { userId, replies: due.replies.map((r) => ({ applicationId: r.applicationId, title: r.title, company: r.company, daysAgo: r.daysAgo })), questions: due.questions.map((q) => ({ applicationId: q.applicationId, title: q.title, company: q.company, stage: q.stage })) },
          `Notifier — ask this candidate about ${due.replies.length} application${due.replies.length === 1 ? "" : "s"} and ${due.questions.length} interview${due.questions.length === 1 ? "" : "s"}.`
        );
        prompted++;
      }
      return `Closed ${expired} silent application${expired === 1 ? "" : "s"} as "no reply"; ${prompted} candidate${prompted === 1 ? "" : "s"} to ask${left ? `, ${left} deferred (out of time)` : ""}.`;
    }
    const { userId } = msg.payload as Payloads["inbox.sync"];
    const r = await syncUserEmails(userId, {
      // Report every status change into THIS conversation so the coach picks it up.
      publish: (change) =>
        ctx.send("application.changed", change, `${change.title} @ ${change.company} moved to "${change.status}". Coach — anything to prepare?`),
    });
    if (r.error) throw new Error(r.error);
    return `Read ${r.fetched} emails, ${r.classified} new, ${r.updated} application${r.updated === 1 ? "" : "s"} advanced.`;
  },
});
