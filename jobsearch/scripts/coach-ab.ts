/**
 * Coach A/B: the same interview on two providers, side by side.
 *
 *   npx tsx -r dotenv/config scripts/coach-ab.ts <sessionId> [--questions wix]
 *   (DOTENV_CONFIG_PATH=.env.local; needs OPENAI_API_KEY and ANTHROPIC_API_KEY)
 *
 * Three comparisons, each run once per provider through the real product code:
 *   1. Interviewer turns — the candidate's real answers from the session are
 *      replayed in order; each provider's interviewer reacts and asks its own
 *      next question (follow-up discipline, Hebrew, résumé probing).
 *   2. The final debrief on the session's real transcript.
 *   3. Suggested answers to five questions from a company's question bank.
 * Output: an HTML report on the Desktop, opened automatically.
 */
import { connectToDatabase } from "@/app/lib/db";
import InterviewSession from "@/app/models/InterviewSession";
import InterviewPrep from "@/app/models/InterviewPrep";
import User from "@/app/models/User";
import SuggestedAnswer from "@/app/models/SuggestedAnswer";
import { interviewerTurn, finalFeedback, type SessionTurn, type SimInput } from "@/app/lib/interview/simulator";
import { suggestAnswer } from "@/app/lib/interview/suggestedAnswer";
import { questionBank } from "@/app/lib/outcomes/questions";
import { withProvider } from "@/app/lib/llm/chat";
import { modelFor, type LlmProvider } from "@/app/lib/llm/models";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic"];
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ms = () => Date.now();

async function main() {
  const sessionId = process.argv[2];
  const qCompany = process.argv.includes("--questions") ? process.argv[process.argv.indexOf("--questions") + 1] : "wix";
  const only = new Set((process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "interview,feedback,answers").split(","));
  const prevPath = path.join(os.homedir(), "Desktop", "JobMatch-coach-AB.json");
  const prev: Record<string, any> = only.size < 3 && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : {}; // keep the parts not re-run
  if (!sessionId) throw new Error("usage: coach-ab.ts <sessionId> [--questions <company>]");
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) throw new Error("both OPENAI_API_KEY and ANTHROPIC_API_KEY are required");
  await connectToDatabase();
  const session: any = await InterviewSession.findById(sessionId).lean();
  if (!session) throw new Error("session not found");
  const prep: any = await InterviewPrep.findById(session.prepId).lean();
  const user: any = await User.findById(session.userId).select("+resumeText").lean();
  const resumeText = String(user?.resumeText || "");
  const transcript: SessionTurn[] = session.transcript.map((t: any) => ({ role: t.role, content: t.content }));
  const answers = transcript.filter((t) => t.role === "candidate").map((t) => t.content);
  const base: Omit<SimInput, "transcript" | "targetQuestions"> = { plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief || "", resumeText, language: session.language || "he", interviewer: { name: "דנה", gender: "female" } };

  const save = () => writeFileSync(prevPath, JSON.stringify(report, null, 2));
  const report: Record<string, any> = { ...prev, meta: { sessionId, company: session.company, title: session.jobTitle, stage: session.stage, answers: answers.length } };

  // 1. interviewer replay: same fixed candidate answers, each provider drives its own questions
  if (only.has("interview")) report.interview = {};
  for (const provider of only.has("interview") ? PROVIDERS : []) {
    const t0 = ms();
    const turns: { role: string; content: string }[] = [];
    let done = false;
    await withProvider(provider, async () => {
      // opening
      let r = await interviewerTurn({ ...base, transcript: [], targetQuestions: 5 });
      turns.push({ role: "interviewer", content: r.message });
      for (const a of answers) {
        if (done) break;
        turns.push({ role: "candidate", content: a });
        r = await interviewerTurn({ ...base, transcript: turns as SessionTurn[], targetQuestions: 5 });
        turns.push({ role: "interviewer", content: r.message });
        done = r.done;
      }
    });
    report.interview[provider] = { model: modelFor("coach", provider), seconds: Math.round((ms() - t0) / 100) / 10, turns, interviewerTurns: turns.filter((t) => t.role === "interviewer").length };
    save();
  }

  // 2. debrief on the real transcript (no prior reviews: both write everything themselves)
  if (only.has("feedback")) report.feedback = {};
  for (const provider of only.has("feedback") ? PROVIDERS : []) {
    const t0 = ms();
    try {
      const fb = await withProvider(provider, () => finalFeedback({ ...base, transcript }));
      report.feedback[provider] = { model: modelFor("coach", provider), seconds: Math.round((ms() - t0) / 100) / 10, fb };
    } catch (e) {
      report.feedback[provider] = { model: modelFor("coach", provider), seconds: Math.round((ms() - t0) / 100) / 10, error: (e as Error).message };
    }
    save();
  }

  // 3. suggested answers: five bank questions, fresh for both (cache cleared for the user first)
  const bank = await questionBank(qCompany, { limit: 40 });
  const qs = only.has("answers") ? bank.questions.slice(0, 5) : [];
  await SuggestedAnswer.deleteMany({ userId: user._id });
  if (only.has("answers")) report.answers = { company: bank.company, items: [] as any[] };
  for (const q of qs) {
    const row: any = { question: q.question, stage: q.stage };
    for (const provider of PROVIDERS) {
      const t0 = ms();
      await SuggestedAnswer.deleteMany({ userId: user._id });
      const r = await withProvider(provider, () => suggestAnswer({ userId: String(user._id), company: bank.company, question: q.question, stage: q.stage, topic: q.topic }));
      row[provider] = { seconds: Math.round((ms() - t0) / 100) / 10, ...(r.ok ? { answer: r.answer, tips: r.tips, placeholders: r.placeholders } : { error: r.reason }) };
    }
    report.answers.items.push(row);
    save();
  }
  await SuggestedAnswer.deleteMany({ userId: user._id }); // leave no experiment answers in the product

  // HTML
  const col = (p: LlmProvider) => (p === "openai" ? "A · OpenAI" : "B · Claude");
  const turnsHtml = (p: LlmProvider) => report.interview[p].turns.map((t: any) => `<div class="t ${t.role}"><b>${t.role === "interviewer" ? "מראיין" : "מועמד"}:</b> ${esc(t.content)}</div>`).join("");
  const fbHtml = (p: LlmProvider) => { const f = report.feedback[p]; if (f.error) return `<p class="err">${esc(f.error)}</p>`; const b = f.fb; return `<p><b>ציון ${b.overallScore}</b> · ${esc(b.verdict)}</p><p>${esc(b.summary)}</p><h4>חוזקות</h4><ul>${b.strengths.map((x: string) => `<li>${esc(x)}</li>`).join("")}</ul><h4>לשיפור</h4><ul>${b.improvements.map((x: string) => `<li>${esc(x)}</li>`).join("")}</ul><h4>ממדים</h4><ul>${b.dimensions.map((d: any) => `<li><b>${esc(d.name)} ${d.score}</b> — ${esc(d.notes)}</li>`).join("")}</ul><h4>סקירת תשובות (${b.answerReviews.length})</h4>${b.answerReviews.slice(0, 4).map((r: any) => `<div class="rv"><b>${esc(r.question)}</b> · ${r.score}/10<br><i>${esc(r.whatWorked)}</i><br>תשובה טובה יותר: ${esc(r.betterAnswer)}</div>`).join("")}`; };
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>Coach A/B — JobMatch</title>
<style>body{font-family:-apple-system,Assistant,system-ui;margin:24px;color:#15171f;background:#f6f7fb}h1{font-size:22px}h2{font-size:18px;margin-top:36px}h3{font-size:14px;color:#555;margin:0 0 8px}h4{font-size:13px;margin:12px 0 4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{background:#fff;border:1px solid #dfe3ee;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.55}
.t{padding:6px 8px;margin:4px 0;border-radius:8px}.t.interviewer{background:#eef1fb}.t.candidate{background:#f4f4f4;color:#444}.rv{border-top:1px dashed #dfe3ee;padding:8px 0}.err{color:#b00}.meta{color:#666;font-size:12px}li{margin:2px 0}</style>
<h1>המאמן לראיונות: OpenAI מול Claude</h1>
<p class="meta">ראיון: ${esc(report.meta.company)} · ${esc(report.meta.title)} · שלב ${esc(report.meta.stage)} · ${report.meta.answers} תשובות של המועמד הוזנו לשני הצדדים באותו סדר. A = ${esc(modelFor("coach", "openai"))}, B = ${esc(modelFor("coach", "anthropic"))}.</p>
${report.interview?.openai ? `<h2>1 · המראיין (אותן תשובות, כל מראיין שואל את השאלות שלו)</h2>
<div class="grid">${PROVIDERS.map((p) => `<div class="card"><h3>${col(p)} · ${esc(report.interview[p].model)} · ${report.interview[p].interviewerTurns} תורות · ${report.interview[p].seconds}s</h3>${turnsHtml(p)}</div>`).join("")}</div>` : ""}
${report.feedback?.openai ? `<h2>2 · המשוב בסוף הראיון (על התמליל האמיתי)</h2>
<div class="grid">${PROVIDERS.map((p) => `<div class="card"><h3>${col(p)} · ${esc(report.feedback[p].model)} · ${report.feedback[p].seconds}s</h3>${fbHtml(p)}</div>`).join("")}</div>` : ""}
${report.answers?.items?.length ? `<h2>3 · תשובות מוצעות (${esc(report.answers.company)}, לפי קורות החיים שלך)</h2>` : ""}
${(report.answers?.items || []).map((it: any) => `<p><b>${esc(it.question)}</b></p><div class="grid">${PROVIDERS.map((p) => `<div class="card"><h3>${col(p)} · ${it[p].seconds}s${it[p].placeholders ? ` · ${it[p].placeholders} placeholders` : ""}</h3>${it[p].error ? `<p class="err">${esc(it[p].error)}</p>` : `<p>${esc(it[p].answer)}</p><ul>${(it[p].tips || []).map((t: string) => `<li>${esc(t)}</li>`).join("")}</ul>`}</div>`).join("")}</div>`).join("")}
</html>`;
  const out = path.join(os.homedir(), "Desktop", "JobMatch-coach-AB.html");
  writeFileSync(out, html);
  writeFileSync(out.replace(/\.html$/, ".json"), JSON.stringify(report, null, 2));
  console.log("report:", out);
  try { execSync(`open "${out}"`); } catch {}
}

main().then(() => process.exit(0)).catch((e) => { console.error("coach-ab failed:", e); process.exit(1); });
