import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { extractJson } from "@/app/lib/resume/tailor";

/**
 * LLM-as-judge for free-text outputs (interview debriefs, articles). The
 * judge gets a rubric and the ground truth (résumé/transcript) so it can
 * catch invented facts, and returns 1–5 per criterion with a one-line reason.
 */
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "gpt-4o";

export type JudgeScores = { specificity: number; honesty: number; actionability: number; tone: number; reasons: Record<string, string> };

export async function judgeFeedback(input: { resume: string; transcript: { role: string; content: string }[]; feedback: unknown }): Promise<JudgeScores> {
  const system = `You are a strict evaluator of interview debriefs written for a job candidate. Score 1–5 on each criterion:
- specificity: does it quote/refer to what the candidate actually said, with concrete examples, instead of generic advice?
- honesty: are all claims grounded in the transcript and résumé? Any invented experience, skill, or event the candidate never mentioned → 1.
- actionability: could the candidate act on it tomorrow (concrete phrasing, what to practise, what to change)?
- tone: direct and respectful; neither cruel nor flattering; scores consistent with the text.
Return STRICT JSON: {"specificity":n,"honesty":n,"actionability":n,"tone":n,"reasons":{"specificity":"…","honesty":"…","actionability":"…","tone":"…"}}.`;
  const user = `RÉSUMÉ:\n${input.resume}\n\nTRANSCRIPT:\n${input.transcript.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n")}\n\nDEBRIEF (JSON):\n${JSON.stringify(input.feedback).slice(0, 8000)}`;
  const res = await new ChatOpenAI({ modelName: JUDGE_MODEL, temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
  const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
  const j: any = extractJson(text);
  const n = (v: unknown) => Math.max(1, Math.min(5, Number(v) || 1));
  return { specificity: n(j.specificity), honesty: n(j.honesty), actionability: n(j.actionability), tone: n(j.tone), reasons: j.reasons || {} };
}

/** Spearman rank correlation. */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const sorted = [...xs].map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const r = new Array(xs.length);
    sorted.forEach((s, k) => (r[s.i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** Fraction of candidate-wise pairs where the model orders two postings the same way as the label (ties ignored). */
export function pairwiseAccuracy(items: { group: string; label: number; pred: number }[]): number {
  let ok = 0;
  let total = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.group !== b.group || a.label === b.label) continue;
      total++;
      if (Math.sign(a.label - b.label) === Math.sign(a.pred - b.pred)) ok++;
    }
  return total ? ok / total : 1;
}
