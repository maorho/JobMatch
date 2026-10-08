import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { structuredToText, isStructuredResume, type StructuredResume } from "./structuredToText";

/**
 * The "tailor my résumé to this job" agent.
 *
 * Input: the candidate's stored résumé (structured JSON when we have it,
 * otherwise raw text) and one job posting. Output: the same résumé
 * re-targeted at that posting — reordered, rephrased, keyword-aligned —
 * plus a fit analysis. It must never invent experience: anything the job
 * asks for that the candidate lacks is reported as a gap, not added.
 */
export type TailorInput = {
  resumeStructured?: unknown;
  resumeText?: string;
  profile?: { fullname?: string; email?: string; phone?: string; currentJob?: string };
  job: { title: string; company: string; description: string; city?: string; country?: string };
  /** Language for the advice fields (résumé content itself stays English). */
  language?: "he" | "en";
};

const itemSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  location: z.string().optional(),
  dateRange: z.string().optional(),
  contact: z.array(z.string()).optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});
const sectionSchema = z.object({ heading: z.string(), items: z.array(itemSchema) });

export const tailorResultSchema = z.object({
  tailoredResume: z.array(sectionSchema).min(1),
  fitScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  keywordGaps: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  changes: z.array(z.string()).default([]),
});
export type TailorResult = z.infer<typeof tailorResultSchema>;

const MAX_CHARS = 7000;

/** Pull a JSON object out of an LLM reply that may be fenced or chatty. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}

export function buildTailorPrompt(input: TailorInput): { system: string; user: string } {
  const lang = input.language === "he" ? "Hebrew" : "English";
  const resumeBlock = isStructuredResume(input.resumeStructured)
    ? JSON.stringify(input.resumeStructured)
    : (input.resumeText || "").slice(0, MAX_CHARS);
  const system = `
You are a senior technical recruiter and résumé writer. You tailor ONE candidate's résumé to ONE job posting.

HARD RULES
- Never invent, inflate or imply experience, employers, titles, dates, degrees or skills the candidate does not have.
- You may reorder sections and bullets, rephrase bullets with the job's vocabulary, pick which achievements to foreground, and rewrite the summary for this role.
- Every skill the job needs that the candidate lacks goes into "missingSkills" (or "keywordGaps" for ATS terms) — NOT into the résumé.
- Keep the résumé content in English. Write "suggestions" and "changes" in ${lang}.
- Keep the exact section JSON shape of the input résumé: an array of { "heading", "items": [{ "title", "subtitle", "location", "dateRange", "contact", "summary", "bullets" }] }. Header first.
- fitScore: 0-100 honest estimate of how well the candidate fits the posting as it stands (not after tailoring).

OUTPUT: strict JSON only, no markdown:
{
  "tailoredResume": [...sections...],
  "fitScore": 0-100,
  "matchedSkills": ["skills the candidate has that the job asks for"],
  "missingSkills": ["required/preferred skills the candidate lacks"],
  "keywordGaps": ["ATS keywords from the posting absent from the résumé"],
  "suggestions": ["concrete, actionable advice for THIS application (3-6 items)"],
  "changes": ["what you changed and why (3-6 items)"]
}`.trim();

  const profile = input.profile
    ? `CANDIDATE PROFILE: ${JSON.stringify({ name: input.profile.fullname, email: input.profile.email, phone: input.profile.phone, currentJob: input.profile.currentJob })}\n\n`
    : "";
  const user = `${profile}CANDIDATE RÉSUMÉ:
"""
${resumeBlock}
"""

JOB POSTING — ${input.job.title} at ${input.job.company}${input.job.city || input.job.country ? ` (${[input.job.city, input.job.country].filter(Boolean).join(", ")})` : ""}:
"""
${(input.job.description || "").slice(0, MAX_CHARS)}
"""

Tailor the résumé to this posting and return the JSON.`;
  return { system, user };
}

export async function tailorResumeToJob(input: TailorInput): Promise<TailorResult> {
  if (!isStructuredResume(input.resumeStructured) && !(input.resumeText || "").trim()) {
    throw Object.assign(new Error("No résumé to tailor"), { code: "NO_RESUME" });
  }
  const { system, user } = buildTailorPrompt(input);
  const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelKwargs: { response_format: { type: "json_object" } },
  });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
  const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
  const parsed = tailorResultSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(`Tailor output invalid: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  }
  const out = parsed.data;
  out.fitScore = Math.round(out.fitScore);
  return out;
}

/** Plain-text form of a tailored résumé (for previews / embeddings). */
export const tailoredToText = (r: StructuredResume) => structuredToText(r);
