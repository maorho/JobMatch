import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { matchForUser } from "@/app/lib/matcher/matchCandidate";
import { getCandidateVector } from "@/app/lib/matcher/candidateProfile";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import { autoApplyCandidatesSince } from "@/app/lib/apply/autoApply";

const TOP_N = 5;
const MIN_SCORE = 60;
const EMBED_BATCH = 500;
const MAX_BATCHES = 4;

export const matcherAgent = registerAgent({
  name: "matcher",
  title: "Matcher",
  description: "Embeds postings and résumés, ranks jobs for a candidate, and answers fit questions from the other agents.",
  handles: ["jobs.normalized", "resume.updated", "fit.request"],
  async handle(msg, ctx) {
    switch (msg.type) {
      case "jobs.normalized": {
        const p = msg.payload as Payloads["jobs.normalized"];
        let embedded = 0;
        let remaining = 0;
        for (let i = 0; i < MAX_BATCHES; i++) {
          const r = await embedPendingJobs(EMBED_BATCH);
          embedded += r.processed;
          remaining = r.remaining;
          if (remaining === 0 || r.processed === 0) break;
        }
        await ctx.send(
          "jobs.embedded",
          { since: p.since, embedded, remaining },
          `${embedded} postings now have vectors${remaining ? ` (${remaining} left for the next tick)` : ""}. Notifier — tell people about their new matches.`
        );
        // Opted-in candidates: anything new that clears their bar goes to the Applier.
        const picks = await autoApplyCandidatesSince(new Date(p.since));
        for (const [userId, jobs] of picks) {
          await ctx.send("apply.request", { userId, jobs, trigger: "new_postings" }, `Applier — ${jobs.length} new posting${jobs.length === 1 ? "" : "s"} clear this candidate's auto-apply bar (best ${jobs[0].score}%).`);
        }
        return `Embedded ${embedded} postings, ${remaining} remaining${picks.size ? `; ${picks.size} candidate${picks.size === 1 ? "" : "s"} have auto-apply matches` : ""}.`;
      }

      case "resume.updated": {
        const { userId } = msg.payload as Payloads["resume.updated"];
        const matches = await matchForUser(userId, { limit: TOP_N, minScore: MIN_SCORE, rerank: true });
        if (!matches.length) return "No postings score above the bar for this résumé yet.";
        const top = matches.map((m) => ({ jobId: String(m._id), title: m.job, company: m.company, score: m.matchScore }));
        await ctx.send("candidate.matched", { userId, top }, `Top ${top.length} for this résumé: ${top.map((t) => `${t.title} @ ${t.company} (${t.score}%)`).join("; ")}. Notifier — let them know.`);
        // Fresh résumé + auto-apply on → let the Applier look at the top matches right away.
        const u: any = await User.findById(userId).select("autoApply").lean();
        if (u?.autoApply?.enabled) {
          const bar = u.autoApply.minScore ?? 75;
          const eligible = top.filter((t) => t.score >= bar).map((t) => ({ ...t, jobModel: "ExternalJobs" as const }));
          if (eligible.length) await ctx.send("apply.request", { userId, jobs: eligible, trigger: "resume_updated" }, `Applier — ${eligible.length} of these clear the candidate's ${bar}% auto-apply bar.`);
        }
        return `Ranked the catalog for the candidate; best match ${top[0].score}%.`;
      }

      case "fit.request": {
        const p = msg.payload as Payloads["fit.request"];
        let score: number | null = null;
        if (p.jobModel === "ExternalJobs") {
          const [vec, job] = await Promise.all([
            getCandidateVector(p.userId),
            ExternalJobs.findById(p.jobId).select("+embedding").lean() as Promise<any>,
          ]);
          if (vec && Array.isArray(job?.embedding) && job.embedding.length) score = toMatchScore(cosineSimilarity(vec, job.embedding));
        }
        // The coach is stateless: echo back the context it sent us.
        await ctx.reply(
          "fit.reply",
          { userId: p.userId, jobId: p.jobId, jobModel: p.jobModel, score, context: p.context },
          score === null ? "I have no vector for this job (internal/manual posting), so no score — go ahead without it." : `Fit is ${score}% between this résumé and the posting.`
        );
        return score === null ? "Answered: no score available." : `Answered: ${score}% fit.`;
      }
    }
  },
});
