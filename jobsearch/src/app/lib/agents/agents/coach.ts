import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { ensureInterviewPlan } from "@/app/lib/interview/ensurePlan";

/** Application statuses that have an interview stage worth preparing for. */
const STAGE_BY_STATUS: Record<string, string> = {
  "HR Phone Interview": "hr",
  "Technical Interview": "technical",
  "Final Interview": "final",
};

export const coachAgent = registerAgent({
  name: "coach",
  title: "Coach",
  description: "When an application reaches an interview stage, asks the Matcher how well the candidate fits, then prepares a plan for that stage.",
  handles: ["application.changed", "fit.reply", "research.reply"],
  async handle(msg, ctx) {
    switch (msg.type) {
      case "application.changed": {
        const p = msg.payload as Payloads["application.changed"];
        const stage = STAGE_BY_STATUS[p.status];
        if (!stage) return `"${p.status}" has no interview stage to prepare for — nothing to do.`;
        await ctx.send(
          "fit.request",
          { userId: p.userId, jobId: p.jobId, jobModel: p.jobModel, context: p },
          `Matcher — ${p.title} @ ${p.company} reached the ${stage} stage. How well does this candidate fit, so I can focus the prep?`
        );
        return `Interview stage "${stage}" detected; asked the Matcher for the fit score.`;
      }

      case "fit.reply": {
        const p = msg.payload as Payloads["fit.reply"];
        const c = p.context;
        const stage = STAGE_BY_STATUS[c.status] || "hr";
        await ctx.send(
          "research.request",
          { company: c.company, context: { ...c, score: p.score, stage } },
          `Researcher — ${c.company}: what should this candidate know before the ${stage} interview? Recent news, products, how they interview.`
        );
        return `Fit ${p.score ?? "n/a"}%. Asked the Researcher to brief me on ${c.company} before I write the ${stage} plan.`;
      }

      case "research.reply": {
        const p = msg.payload as Payloads["research.reply"];
        const c = p.context;
        const stage = c.stage;
        const source = c.jobModel === "Job" ? "internal" : c.jobModel === "ExternalJobs" ? "external" : null;
        let generated = false;
        if (source && (process.env.OPENAI_API_KEY || process.env.NODE_ENV === "test")) {
          const plan = await ensureInterviewPlan({ userId: c.userId, jobId: c.jobId, source });
          generated = !!plan && !plan.cached;
          if (plan?.cached) ctx.log("A plan already existed for this job; reusing it.");
        } else if (!source) {
          ctx.log("Manually-added job: no posting text to build a plan from.");
        }
        await ctx.send(
          "prep.ready",
          { userId: c.userId, jobId: c.jobId, source: source ?? "external", stage, status: c.status, title: c.title, company: c.company, score: c.score, generated },
          `${generated ? "Plan ready" : "Prep page ready"} for the ${stage} stage at ${c.company}${c.score !== null ? ` (fit ${c.score}%)` : ""}${p.headline ? ` — briefed: ${p.headline}` : ""}. Notifier — invite the candidate.`
        );
        return generated ? `Generated a ${stage}-stage plan for ${c.title} @ ${c.company} with the research brief (${p.confidence}).` : `Pointed the candidate to the ${stage} prep for ${c.title} @ ${c.company}.`;
      }
    }
  },
});
