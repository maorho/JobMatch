/**
 * Which model should be the interviewer? Replays one real session's candidate
 * answers through the product's interviewer on each model and writes the
 * conversations side by side, with per-turn latency, token usage and cost.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/interviewer-models.ts <sessionId> [provider:model,...]
 *
 * e.g. anthropic:claude-opus-5-5,openai:gpt-6.1-sol,openai:gpt-6.1-terra
 */
import { connectToDatabase } from "@/app/lib/db";
import InterviewSession from "@/app/models/InterviewSession";
import InterviewPrep from "@/app/models/InterviewPrep";
import User from "@/app/models/User";
import { interviewerTurn, type SessionTurn, type SimInput } from "@/app/lib/interview/simulator";
import { withProvider, onLlmUsage, type LlmUsage } from "@/app/lib/llm/chat";
import type { LlmProvider } from "@/app/lib/llm/models";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** USD per million tokens (input, output), from the providers' price pages on 2026-11-01. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5-20251001": [1, 5],
  "gpt-6-astra": [10, 50],
  "gpt-6.1-sol": [2, 10],
  "gpt-6-sol": [2, 10],
  "gpt-6.1-terra": [1, 5],
  "gpt-6-luna": [0.1, 0.5],
  "gpt-5.5": [5, 30],
  "gpt-5.4": [2.5, 15],
  "gpt-4o": [2.5, 10],
};
const costOf = (model: string, inTok: number, outTok: number) => {
  const p = PRICES[model];
  return p ? (inTok * p[0] + outTok * p[1]) / 1e6 : NaN;
};

type Run = { provider: LlmProvider; turns: { role: string; content: string; ms?: number }[]; error?: string; totalMs: number; inputTokens: number; outputTokens: number; cost: number };

async function main() {
  const sessionId = process.argv[2];
  const specs = (process.argv[3] || "anthropic:claude-opus-5-5,openai:gpt-6.1-sol,openai:gpt-6.1-terra").split(",").map((s) => {
    const [provider, model] = s.includes(":") ? (s.split(":") as [LlmProvider, string]) : (["anthropic", s] as [LlmProvider, string]);
    return { provider, model };
  });
  if (!sessionId) throw new Error("usage: interviewer-models.ts <sessionId> [provider:model,...]");
  await connectToDatabase();
  const session: any = await InterviewSession.findById(sessionId).lean();
  const prep: any = await InterviewPrep.findById(session.prepId).lean();
  const user: any = await User.findById(session.userId).select("+resumeText").lean();
  const answers = session.transcript.filter((t: any) => t.role === "candidate").map((t: any) => t.content as string);
  const base: Omit<SimInput, "transcript" | "targetQuestions"> = { plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief || "", resumeText: String(user?.resumeText || ""), language: session.language || "he", interviewer: { name: "דנה", gender: "female" } };

  const runs: Record<string, Run> = {};
  for (const { provider, model } of specs) {
    process.env.LLM_MODEL_COACH = model;
    const turns: Run["turns"] = [];
    const usage = { input: 0, output: 0 };
    const stop = onLlmUsage((u: LlmUsage) => { usage.input += u.inputTokens; usage.output += u.outputTokens; });
    const t0 = Date.now();
    let error: string | undefined;
    try {
      await withProvider(provider, async () => {
        let t = Date.now();
        let r = await interviewerTurn({ ...base, transcript: [], targetQuestions: 5 });
        turns.push({ role: "interviewer", content: r.message, ms: Date.now() - t });
        for (const a of answers) {
          if (r.done) break;
          turns.push({ role: "candidate", content: a });
          t = Date.now();
          r = await interviewerTurn({ ...base, transcript: turns.map(({ role, content }) => ({ role, content })) as SessionTurn[], targetQuestions: 5 });
          turns.push({ role: "interviewer", content: r.message, ms: Date.now() - t });
        }
      });
    } catch (e: any) {
      error = e?.error?.error?.message || e?.error?.message || e?.message || String(e);
    }
    stop();
    runs[model] = { provider, turns, error, totalMs: Date.now() - t0, inputTokens: usage.input, outputTokens: usage.output, cost: costOf(model, usage.input, usage.output) };
    const r = runs[model];
    const lat = r.turns.filter((t) => t.ms).map((t) => t.ms!);
    console.log(`\n=== ${provider}:${model} ${r.error ? "ERROR: " + r.error : `| ${lat.length} turns | avg ${Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length))}ms/turn | in ${r.inputTokens} out ${r.outputTokens} tokens | $${r.cost.toFixed(4)}`}`);
    for (const t of r.turns) if (t.role === "interviewer") console.log(`  [${t.ms}ms] ${t.content.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  delete process.env.LLM_MODEL_COACH;

  const models = specs.map((s) => s.model);
  const cols = models.map((m) => { const r = runs[m]; const lat = r.turns.filter((t) => t.ms).map((t) => t.ms!); return `<div class="card"><h3>${esc(m)}<br><small>${r.error ? `<span class="err">${esc(r.error)}</span>` : `${lat.length} תורות · ממוצע ${Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)) / 1000}s לתור · ${r.inputTokens.toLocaleString()} קלט / ${r.outputTokens.toLocaleString()} פלט · <b>$${r.cost.toFixed(3)}</b> לראיון`}</small></h3>${r.turns.map((t) => `<div class="t ${t.role}"><b>${t.role === "interviewer" ? "מראיין" : "מועמד"}${t.ms ? ` <small>${(t.ms / 1000).toFixed(1)}s</small>` : ""}:</b> ${esc(t.content)}</div>`).join("")}</div>`; }).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>Interviewer models — JobMatch</title>
<style>body{font-family:-apple-system,Assistant,system-ui;margin:20px;color:#15171f;background:#f6f7fb}h1{font-size:20px}h3{font-size:14px;margin:0 0 10px}small{color:#666;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(${models.length},1fr);gap:12px}.card{background:#fff;border:1px solid #dfe3ee;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5}
.t{padding:6px 8px;margin:4px 0;border-radius:8px}.t.interviewer{background:#eef1fb}.t.candidate{background:#f4f4f4;color:#555}.err{color:#b00}</style>
<h1>המראיין על מודלים שונים · ${esc(session.company)} · ${esc(session.jobTitle)}</h1>
<p><small>אותן ${answers.length} תשובות של המועמד הוזנו לכל מראיין באותו סדר; כל מראיין שואל את השאלות שלו. העלות לפי מחירוני הספקים (קלט/פלט), בלי prompt caching.</small></p>
<div class="grid">${cols}</div></html>`;
  const out = path.join(os.homedir(), "Desktop", "JobMatch-interviewer-models.html");
  writeFileSync(out, html);
  writeFileSync(out.replace(/\.html$/, ".json"), JSON.stringify(runs, null, 2));
  console.log("\nreport:", out);
  try { execSync(`open "${out}"`); } catch {}
}
main().then(() => process.exit(0)).catch((e) => { console.error("failed:", e); process.exit(1); });
