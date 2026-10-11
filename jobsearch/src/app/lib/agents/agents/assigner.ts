import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { ensureTasks } from "@/app/lib/practice/author";
import { gradeAttempt } from "@/app/lib/practice/grade";
import { assignmentHours } from "@/app/lib/practice/roles";

/** The Assigner: take-home assignments per role × level, reviewed like a hiring manager would. */
export const assignerAgent = registerAgent({
  name: "assigner",
  title: "Assigner",
  description: "Designs take-home assignments for each role and level (a few hours of real work with concrete deliverables) and reviews what candidates hand in: requirements, architecture, code quality, tests, README.",
  handles: ["assignment.author", "assignment.review"],
  async handle(msg, ctx) {
    if (msg.type === "assignment.author") {
      const p = msg.payload as Payloads["assignment.author"];
      const r = await ensureTasks("assignment", p.role, p.level, { add: p.count ?? 1, log: ctx.log });
      return r.added ? `Designed ${r.added} ${r.source === "seed" ? "built-in " : ""}take-home${r.added === 1 ? "" : "s"} for a ${p.level} ${p.role} (~${assignmentHours(p.role, p.level)}h each); the bank now holds ${r.before + r.added}.` : `Could not add to the ${p.role}/${p.level} bank (it holds ${r.before}); see the log.`;
    }
    const p = msg.payload as Payloads["assignment.review"];
    const r = await gradeAttempt(p.attemptId, { by: "assigner" });
    if (!r) return `Attempt ${p.attemptId} not found.`;
    await ctx.send("practice.graded", { userId: p.userId, attemptId: p.attemptId, kind: "assignment", title: r.task.title, score: r.verdict.score, verdict: r.verdict.verdict }, `Notifier — reviewed "${r.task.title}": ${r.verdict.score}/100 (${r.verdict.verdict}). Tell the candidate.`);
    return `Reviewed "${r.task.title}" (${r.task.role}/${r.task.level}): ${r.verdict.score}/100, ${r.verdict.verdict}${r.attempt.timedOut ? ", handed in after the window" : ""}${r.model === "heuristic" ? " — heuristic review (no model)" : ""}.`;
  },
});
