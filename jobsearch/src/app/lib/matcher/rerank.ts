import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import MatchCache from "@/app/models/MatchCache";
import { extractJson } from "@/app/lib/resume/tailor";

/**
 * Second-stage ranking of a candidate's top matches. Embeddings find the
 * neighbourhood; this pass reads the actual postings against the résumé and
 * says how realistic each one is (0–100), why, and what's missing — the
 * numbers the feed shows and the Applier trusts. Cached per résumé version.
 */
export const RERANK_MODEL = "gpt-4o-mini";
export const RERANK_BATCH = 12;

export type RerankCandidate = { _id: string; job: string; company: string; description: string; city?: string; country?: string; seniority?: string[] | string };
export type RerankVerdict = { _id: string; fit: number; why: string; gaps: string[]; cached: boolean };

const verdictSchema = z.object({
  results: z.array(z.object({ id: z.string(), fit: z.number().min(0).max(100), why: z.string().default(""), gaps: z.array(z.string()).default([]) })),
});

export function buildRerankPrompt(resumeSummary: string, level: string, jobs: RerankCandidate[], language: "he" | "en"): { system: string; user: string } {
  const lang = language === "he" ? "Hebrew (technical terms in English)" : "English";
  const system = `You are a senior technical recruiter in Israel. For each posting, judge how realistic it is that THIS candidate gets an interview, given their résumé and level (${level}).
Scoring guide (0–100): 85+ = strong fit, apply now; 70–84 = good fit with a small gap; 50–69 = stretch (level or core skill missing); <50 = not realistic (wrong level/domain/location).
Weigh: required level vs the candidate's, the 2–3 core skills the posting actually needs, domain, language/location constraints stated in the posting. Ignore nice-to-haves.
"why": ONE short sentence in ${lang} addressed to the candidate (what makes it a fit). "gaps": up to 3 short items in ${lang} (what's missing), empty if none.
Return STRICT JSON: {"results":[{"id","fit","why","gaps":[...]}]} with every id exactly once. Nothing else.`;
  const user = `CANDIDATE (${level}):\n${resumeSummary.slice(0, 3500)}\n\nPOSTINGS:\n${jobs
    .map((j) => `[id=${j._id}] ${j.job} @ ${j.company}${j.city || j.country ? ` (${[j.city, j.country].filter(Boolean).join(", ")})` : ""}\n${(j.description || "").replace(/\s+/g, " ").slice(0, 900)}`)
    .join("\n\n")}`;
  return { system, user };
}

const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

/** Rerank with an LLM (cached). `useLLM: false` returns only cached verdicts. */
export async function rerankForUser(opts: { userId: string; resumeVersion: number; resumeSummary: string; level: string; jobs: RerankCandidate[]; language?: "he" | "en"; useLLM?: boolean }): Promise<Map<string, RerankVerdict>> {
  await connectToDatabase();
  const out = new Map<string, RerankVerdict>();
  if (!opts.jobs.length) return out;
  const cached: any[] = await MatchCache.find({ userId: opts.userId, resumeVersion: opts.resumeVersion, jobId: { $in: opts.jobs.map((j) => j._id) } }).lean();
  for (const c of cached) out.set(String(c.jobId), { _id: String(c.jobId), fit: c.fit, why: c.why, gaps: c.gaps || [], cached: true });
  const useLLM = opts.useLLM ?? !!(process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "test");
  const pending = opts.jobs.filter((j) => !out.has(j._id));
  if (!useLLM || !pending.length) return out;

  for (let i = 0; i < pending.length; i += RERANK_BATCH) {
    const batch = pending.slice(i, i + RERANK_BATCH);
    try {
      const { system, user } = buildRerankPrompt(opts.resumeSummary, opts.level, batch, opts.language || "he");
      const res = await new ChatOpenAI({ modelName: RERANK_MODEL, temperature: 0, maxTokens: 2500, timeout: 45_000, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
      const parsed = verdictSchema.safeParse(extractJson(contentOf(res)));
      if (!parsed.success) continue;
      const ops = [];
      for (const r of parsed.data.results) {
        if (!batch.some((b) => b._id === r.id)) continue;
        const v = { _id: r.id, fit: Math.round(r.fit), why: r.why.slice(0, 400), gaps: r.gaps.slice(0, 3).map((g) => g.slice(0, 120)), cached: false };
        out.set(r.id, v);
        ops.push({ updateOne: { filter: { userId: opts.userId, resumeVersion: opts.resumeVersion, jobId: r.id }, update: { $set: { fit: v.fit, why: v.why, gaps: v.gaps, model: RERANK_MODEL, createdAt: new Date() } }, upsert: true } });
      }
      if (ops.length) await MatchCache.bulkWrite(ops, { ordered: false }).catch(() => null);
    } catch (e) {
      console.warn("[rerank] batch skipped:", (e as Error)?.message);
    }
  }
  return out;
}
