import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { ensureTasks } from "@/app/lib/practice/author";
import { gradeAttempt } from "@/app/lib/practice/grade";
import { codingMinutes } from "@/app/lib/practice/roles";

/** The Examiner: timed coding questions per role × level, graded against a rubric. */
export const examinerAgent = registerAgent({
  name: "examiner",
  title: "Examiner",
  description: "Writes timed coding questions for each role and level (30–60 minutes on the clock) and grades submissions on correctness, complexity, readability and edge cases.",
  handles: ["coding.author", "coding.grade"],
  async handle(msg, ctx) {
    if (msg.type === "coding.author") {
      const p = msg.payload as Payloads["coding.author"];
      const r = await ensureTasks("coding", p.role, p.level, { add: p.count ?? 1, log: ctx.log });
      return r.added ? `Wrote ${r.added} ${r.source === "seed" ? "built-in " : ""}coding question${r.added === 1 ? "" : "s"} for a ${p.level} ${p.role} (${codingMinutes(p.role, p.level)} min each); the bank now holds ${r.before + r.added}.` : `Could not add to the ${p.role}/${p.level} bank (it holds ${r.before}); see the log.`;
    }
    const p = msg.payload as Payloads["coding.grade"];
    const r = await gradeAttempt(p.attemptId, { by: "examiner" });
    if (!r) return `Attempt ${p.attemptId} not found.`;
    await ctx.send("practice.graded", { userId: p.userId, attemptId: p.attemptId, kind: "coding", title: r.task.title, score: r.verdict.score, verdict: r.verdict.verdict }, `Notifier — graded "${r.task.title}": ${r.verdict.score}/100 (${r.verdict.verdict}). Tell the candidate.`);
    return `Graded "${r.task.title}" (${r.task.role}/${r.task.level}): ${r.verdict.score}/100, ${r.verdict.verdict}${r.attempt.timedOut ? ", handed in late" : ""}${r.model === "heuristic" ? " — heuristic grader (no model)" : ""}.`;
  },
});
