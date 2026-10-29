/**
 * Which Claude should be the interviewer? Replays one real session's candidate
 * answers through the product's interviewer on each model and writes the
 * conversations side by side, with per-turn latency.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/interviewer-models.ts <sessionId> [model,model,...]
 */
import { connectToDatabase } from "@/app/lib/db";
import InterviewSession from "@/app/models/InterviewSession";
import InterviewPrep from "@/app/models/InterviewPrep";
import User from "@/app/models/User";
import { interviewerTurn, type SessionTurn, type SimInput } from "@/app/lib/interview/simulator";
import { withProvider } from "@/app/lib/llm/chat";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  const sessionId = process.argv[2];
  const models = (process.argv[3] || "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-4-5-20251001,claude-fable-5-1").split(",");
  if (!sessionId) throw new Error("usage: interviewer-models.ts <sessionId> [models]");
  await connectToDatabase();
  const session: any = await InterviewSession.findById(sessionId).lean();
  const prep: any = await InterviewPrep.findById(session.prepId).lean();
  const user: any = await User.findById(session.userId).select("+resumeText").lean();
  const answers = session.transcript.filter((t: any) => t.role === "candidate").map((t: any) => t.content as string);
  const base: Omit<SimInput, "transcript" | "targetQuestions"> = { plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief || "", resumeText: String(user?.resumeText || ""), language: session.language || "he", interviewer: { name: "דנה", gender: "female" } };

  const runs: Record<string, { turns: { role: string; content: string; ms?: number }[]; error?: string; totalMs: number }> = {};
  for (const model of models) {
    process.env.LLM_MODEL_COACH = model;
    const turns: { role: string; content: string; ms?: number }[] = [];
    const t0 = Date.now();
    try {
      await withProvider("anthropic", async () => {
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
      runs[model] = { turns, totalMs: Date.now() - t0 };
    } catch (e: any) {
      runs[model] = { turns, totalMs: Date.now() - t0, error: e?.error?.error?.message || e?.message || String(e) };
    }
    const r = runs[model];
    const lat = r.turns.filter((t) => t.ms).map((t) => t.ms!);
    console.log(`\n=== ${model} ${r.error ? "ERROR: " + r.error : `| ${lat.length} interviewer turns | avg ${Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length))}ms/turn | max ${Math.max(0, ...lat)}ms`}`);
    for (const t of r.turns) if (t.role === "interviewer") console.log(`  [${t.ms}ms] ${t.content.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  delete process.env.LLM_MODEL_COACH;

  const cols = models.map((m) => { const r = runs[m]; const lat = r.turns.filter((t) => t.ms).map((t) => t.ms!); return `<div class="card"><h3>${esc(m)}<br><small>${r.error ? `<span class="err">${esc(r.error)}</span>` : `${lat.length} תורות · ממוצע ${Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)) / 1000}s לתור`}</small></h3>${r.turns.map((t) => `<div class="t ${t.role}"><b>${t.role === "interviewer" ? "מראיין" : "מועמד"}${t.ms ? ` <small>${(t.ms / 1000).toFixed(1)}s</small>` : ""}:</b> ${esc(t.content)}</div>`).join("")}</div>`; }).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>Interviewer models — JobMatch</title>
<style>body{font-family:-apple-system,Assistant,system-ui;margin:20px;color:#15171f;background:#f6f7fb}h1{font-size:20px}h3{font-size:14px;margin:0 0 10px}small{color:#666;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(${models.length},1fr);gap:12px}.card{background:#fff;border:1px solid #dfe3ee;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5}
.t{padding:6px 8px;margin:4px 0;border-radius:8px}.t.interviewer{background:#eef1fb}.t.candidate{background:#f4f4f4;color:#555}.err{color:#b00}</style>
<h1>המראיין על מודלים שונים של Claude · ${esc(session.company)} · ${esc(session.jobTitle)}</h1>
<p><small>אותן ${answers.length} תשובות של המועמד הוזנו לכל מראיין באותו סדר; כל מראיין שואל את השאלות שלו.</small></p>
<div class="grid">${cols}</div></html>`;
  const out = path.join(os.homedir(), "Desktop", "JobMatch-interviewer-models.html");
  writeFileSync(out, html);
  writeFileSync(out.replace(/\.html$/, ".json"), JSON.stringify(runs, null, 2));
  console.log("\nreport:", out);
  try { execSync(`open "${out}"`); } catch {}
}
main().then(() => process.exit(0)).catch((e) => { console.error("failed:", e); process.exit(1); });
