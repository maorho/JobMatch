import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { extractJson } from "@/app/lib/resume/tailor";
import { buildRerankPrompt } from "@/app/lib/matcher/rerank";
import { inferCandidateLevel } from "@/app/lib/matcher/level";
import { finalFeedback } from "@/app/lib/interview/simulator";
import type { InterviewPlan } from "@/app/lib/interview/prepare";
import { judgeFeedback, spearman, pairwiseAccuracy } from "./judge";

/**
 * Quality evals — real model calls, run on demand (`npm run eval`), never in CI.
 * Each block prints its metrics and writes evals/reports/<date>.json so a
 * prompt change can be compared against the previous run.
 */
const DATA = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "datasets", name), "utf8"));
const report: Record<string, unknown> = { at: new Date().toISOString() };
const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for evals (loaded from .env.local by vitest.evals.config.ts)");
});

describe("level inference (deterministic)", () => {
  it("agrees with the recruiter label on ≥ 90% of résumés", () => {
    const { cases } = DATA("level.json");
    const hits = cases.filter((c: any) => inferCandidateLevel(c.resume) === c.level);
    const acc = hits.length / cases.length;
    const misses = cases.filter((c: any) => inferCandidateLevel(c.resume) !== c.level).map((c: any) => `${c.resume.slice(0, 50)} → ${inferCandidateLevel(c.resume)} (want ${c.level})`);
    report.level = { accuracy: acc, misses };
    console.log(`level accuracy ${(acc * 100).toFixed(0)}%`, misses.length ? misses : "");
    expect(acc).toBeGreaterThanOrEqual(0.9);
  });
});

describe("reranker fit vs recruiter labels", () => {
  it("orders postings like a recruiter (pairwise ≥ 85%, Spearman ≥ 0.75, MAE ≤ 15)", async () => {
    const d = DATA("match.json");
    const preds: { group: string; label: number; pred: number; key: string }[] = [];
    for (const [cid, cand] of Object.entries<any>(d.candidates)) {
      const pairs = d.pairs.filter((p: any) => p.candidate === cid);
      const jobs = pairs.map((p: any) => ({ _id: p.posting, job: d.postings[p.posting].title, company: d.postings[p.posting].company, description: d.postings[p.posting].description }));
      const { system, user } = buildRerankPrompt(cand.resume, cand.level, jobs, "en");
      const res = await new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
      const out: any = extractJson(contentOf(res));
      for (const p of pairs) {
        const r = (out.results || []).find((x: any) => x.id === p.posting);
        preds.push({ group: cid, label: p.fit, pred: r ? Number(r.fit) : 50, key: `${cid}→${p.posting}` });
      }
    }
    const pw = pairwiseAccuracy(preds);
    const rho = spearman(preds.map((p) => p.label), preds.map((p) => p.pred));
    const mae = preds.reduce((s, p) => s + Math.abs(p.label - p.pred), 0) / preds.length;
    const worst = [...preds].sort((a, b) => Math.abs(b.label - b.pred) - Math.abs(a.label - a.pred)).slice(0, 5).map((p) => `${p.key}: pred ${p.pred} vs label ${p.label}`);
    report.match = { pairwise: pw, spearman: rho, mae, worst };
    console.log(`match: pairwise ${(pw * 100).toFixed(0)}% · spearman ${rho.toFixed(2)} · MAE ${mae.toFixed(1)}`, worst);
    expect(pw).toBeGreaterThanOrEqual(0.85);
    expect(rho).toBeGreaterThanOrEqual(0.75);
    expect(mae).toBeLessThanOrEqual(15);
  }, 180_000);
});

describe("interview debrief quality", () => {
  it("is specific, honest and actionable (judge ≥ 3.5 avg, honesty ≥ 4), within the expected score band", async () => {
    const { cases } = DATA("interview.json");
    const rows: any[] = [];
    for (const c of cases) {
      const plan: InterviewPlan = { company: { summary: `${c.job.company} is a software company.`, whatTheyDo: "", techStack: [], cultureHints: [] }, roleSummary: c.job.title, stages: [{ key: "hr", title: "HR", description: "", likelyQuestions: [], tips: [] }, { key: "technical", title: "Technical", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] };
      const fb = await finalFeedback({ plan, stage: c.stage, job: c.job, companyBrief: "", resumeText: c.resume, language: "en", transcript: c.transcript });
      const j = await judgeFeedback({ resume: c.resume, transcript: c.transcript, feedback: fb });
      const text = JSON.stringify(fb).toLowerCase();
      const missing = (c.expect.mustMention || []).filter((m: string) => !text.includes(m.toLowerCase()));
      const invented = (c.expect.mustNotInvent || []).filter((m: string) => text.includes(m.toLowerCase()));
      const inBand = fb.overallScore >= c.expect.scoreMin && fb.overallScore <= c.expect.scoreMax;
      rows.push({ id: c.id, score: fb.overallScore, band: [c.expect.scoreMin, c.expect.scoreMax], inBand, missing, invented, judge: j });
      console.log(`${c.id}: score ${fb.overallScore} (${c.expect.scoreMin}–${c.expect.scoreMax}) ${inBand ? "✓" : "✗"} · judge spec ${j.specificity} hon ${j.honesty} act ${j.actionability} tone ${j.tone}${missing.length ? ` · missing ${missing}` : ""}${invented.length ? ` · INVENTED ${invented}` : ""}`);
    }
    report.interview = rows;
    const avg = rows.reduce((s, r) => s + (r.judge.specificity + r.judge.honesty + r.judge.actionability + r.judge.tone) / 4, 0) / rows.length;
    const honesty = Math.min(...rows.map((r) => r.judge.honesty));
    console.log(`interview: judge avg ${avg.toFixed(2)} · min honesty ${honesty} · in band ${rows.filter((r) => r.inBand).length}/${rows.length}`);
    expect(rows.every((r) => r.invented.length === 0)).toBe(true);
    expect(rows.filter((r) => r.inBand).length).toBeGreaterThanOrEqual(rows.length - 1);
    expect(avg).toBeGreaterThanOrEqual(3.5);
    expect(honesty).toBeGreaterThanOrEqual(4);
  }, 300_000);
});

afterAllWrite();
function afterAllWrite() {
  process.on("beforeExit", () => {
    try {
      const dir = path.join(__dirname, "reports");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2));
    } catch {}
  });
}
