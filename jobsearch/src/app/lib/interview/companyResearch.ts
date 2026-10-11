import OpenAI from "openai";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import CompanyBrief from "@/app/models/CompanyBrief";
import { extractJson } from "@/app/lib/resume/tailor";

export const safeJson = (text: string): unknown => {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
};

/**
 * Company research agent: what a well-prepared candidate would know the
 * night before — what the company does, products, recent news (funding,
 * layoffs, launches), size, culture signals, how their interview process is
 * described publicly, tech stack. Uses the OpenAI web search tool through
 * the Responses API and falls back to the model's own knowledge (flagged
 * low-confidence) when search isn't available. Cached per company for a week.
 */
export const RESEARCH_MODEL = process.env.COMPANY_RESEARCH_MODEL || "gpt-4o";
export const BRIEF_TTL_DAYS = 7;

/** Models sometimes return {name, description} objects where we asked for strings — flatten them. */
const str = z.preprocess((v) => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const name = o.name || o.title || o.product || o.url || o.source || "";
    const desc = o.description || o.detail || o.why || "";
    return [name, desc].filter(Boolean).join(" — ") || JSON.stringify(v).slice(0, 120);
  }
  return v == null ? "" : String(v);
}, z.string());
const strList = z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(str)).default([]);

export const briefSchema = z.object({
  summary: str.default(""),
  whatTheyDo: str.default(""),
  products: strList,
  sizeAndStage: str.default(""), // "~900 employees, Series D (2024)"
  recentNews: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ title: str, date: str.default(""), source: str.default(""), why: str.default("") }))).default([]),
  cultureSignals: strList,
  interviewProcess: str.default(""), // what candidates report publicly
  techStack: strList,
  talkingPoints: strList, // 3–5 things a candidate should bring up or be ready for
  sources: strList,
  confidence: z.preprocess((v) => (["high", "medium", "low"].includes(String(v)) ? String(v) : "medium"), z.enum(["high", "medium", "low"])).default("medium"),
});
export type CompanyResearch = z.infer<typeof briefSchema>;

export function buildResearchPrompt(company: string, domain?: string, hints?: { openRoles?: number; sampleTitles?: string[]; techSignals?: string[] }): string {
  return `Research the company "${company}"${domain ? ` (website: ${domain})` : ""} as a candidate preparing for an interview in Israel would.
Find and summarise, with dates and sources where you can:
1. What they do and for whom; main products.
2. Size and stage (employees, funding rounds, public/private, HQ, Israel office).
3. Recent news from the last 12 months: launches, funding, acquisitions, layoffs, leadership changes, incidents.
4. Culture signals (values pages, Glassdoor/Comparably themes, engineering blog topics).
5. How candidates describe the interview process (stages, home assignment, typical questions) — only if actually reported.
6. Tech stack (engineering blog, job postings).${hints?.techSignals?.length ? ` Our own catalog sees these in their postings: ${hints.techSignals.join(", ")}.` : ""}${hints?.openRoles ? ` They currently have ${hints.openRoles} open roles (e.g. ${hints.sampleTitles?.slice(0, 5).join(", ")}).` : ""}
7. 3–5 talking points: things a candidate should bring up or be ready to discuss.
Be concrete and factual. If something is unknown or unverified, leave it out — do not guess. Mark overall confidence (high = multiple current sources; low = mostly prior knowledge).
Keep it compact: the whole JSON under 450 words; at most 6 news items, 5 products, 6 talking points; no citation markers inside strings (put URLs in "sources").
Return STRICT JSON only: {"summary","whatTheyDo","products":[],"sizeAndStage","recentNews":[{"title","date","source","why"}],"cultureSignals":[],"interviewProcess","techStack":[],"talkingPoints":[],"sources":[],"confidence":"high|medium|low"}`;
}

export type ResearchClient = { responses: { create: (args: any) => Promise<any> } };
type Client = ResearchClient;

/** The OpenAI Responses client, or null when there is no key (and always null under test unless a fake is injected). */
export function researchClient(): Client | null {
  if (!process.env.OPENAI_API_KEY || process.env.NODE_ENV === "test") return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as Client;
}

/** Web search can't run in JSON mode; when the free-text answer isn't clean JSON, a cheap second pass converts it. */
export async function repairJsonAs(client: Client, text: string, shape: string): Promise<string> {
  const res = await client.responses.create({ model: "gpt-4o-mini", input: `Convert the following text into STRICT JSON with exactly this shape: ${shape}. Drop citation markers. Text:\n\n${text.slice(0, 12000)}`, text: { format: { type: "json_object" } }, max_output_tokens: 2500 });
  return res.output_text || "";
}

async function repairJson(client: Client, text: string): Promise<string> {
  return repairJsonAs(client, text, "{summary, whatTheyDo, products[], sizeAndStage, recentNews[{title,date,source,why}], cultureSignals[], interviewProcess, techStack[], talkingPoints[], sources[], confidence (high|medium|low)}");
}

/** One Responses call with the web-search tool; falls back to plain generation (the caller treats that as low confidence). */
export async function callWithSearch(client: Client, prompt: string, opts: { model?: string; maxTokens?: number } = {}): Promise<{ text: string; searched: boolean }> {
  const model = opts.model || RESEARCH_MODEL;
  try {
    const res = await client.responses.create({ model, tools: [{ type: "web_search_preview" }], input: prompt, max_output_tokens: opts.maxTokens ?? 4500 });
    const text = res.output_text || (res.output || []).flatMap((o: any) => o.content || []).map((c: any) => c.text || "").join("");
    const searched = (res.output || []).some((o: any) => o.type === "web_search_call");
    return { text, searched };
  } catch (e: any) {
    // Search tool unavailable on this account/model → plain generation, flagged low-confidence.
    const res = await client.responses.create({ model, input: `${prompt}\n\n(Web search is unavailable: answer from what you know and set confidence to "low".)`, max_output_tokens: Math.min(opts.maxTokens ?? 2000, 2000) });
    return { text: res.output_text || "", searched: false };
  }
}

export async function researchCompany(company: string, opts: { domain?: string; hints?: { openRoles?: number; sampleTitles?: string[]; techSignals?: string[] }; client?: Client; force?: boolean } = {}): Promise<{ brief: CompanyResearch; cached: boolean; searched: boolean } | null> {
  const name = (company || "").trim();
  if (!name) return null;
  await connectToDatabase();
  const key = name.toLowerCase();
  if (!opts.force) {
    const cached: any = await CompanyBrief.findOne({ key, createdAt: { $gt: new Date(Date.now() - BRIEF_TTL_DAYS * 864e5) } }).lean();
    if (cached) return { brief: cached.brief, cached: true, searched: !!cached.searched };
  }
  const client = opts.client || (process.env.OPENAI_API_KEY ? (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as Client) : null); // (no test guard here: the research tests inject a fake)
  if (!client) return null;
  const { text, searched } = await callWithSearch(client, buildResearchPrompt(name, opts.domain, opts.hints));
  let parsed = briefSchema.safeParse(safeJson(text));
  if (!parsed.success) {
    const repaired = await repairJson(client, text).catch((e) => `(repair failed: ${e?.message})`);
    parsed = briefSchema.safeParse(safeJson(repaired));
    if (!parsed.success) throw new Error(`Company research output invalid: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")} — text: ${String(text).slice(0, 160).replace(/\s+/g, " ")} … repaired: ${String(repaired).slice(0, 120).replace(/\s+/g, " ")}`);
  }
  const brief = parsed.data;
  if (!searched && brief.confidence !== "low") brief.confidence = "medium";
  await CompanyBrief.findOneAndUpdate({ key }, { $set: { key, company: name, domain: opts.domain || "", brief, searched, model: RESEARCH_MODEL, createdAt: new Date() } }, { upsert: true });
  return { brief, cached: false, searched };
}

/** Compact text for prompts (interviewer, plan, writer). */
export function researchToText(b: CompanyResearch): string {
  const lines = [
    b.summary && `About: ${b.summary}`,
    b.whatTheyDo && `What they do: ${b.whatTheyDo}`,
    b.products.length && `Products: ${b.products.join(", ")}`,
    b.sizeAndStage && `Size/stage: ${b.sizeAndStage}`,
    b.recentNews.length && `Recent news: ${b.recentNews.slice(0, 6).map((n) => `${n.title}${n.date ? ` (${n.date})` : ""}${n.why ? ` — ${n.why}` : ""}`).join("; ")}`,
    b.cultureSignals.length && `Culture: ${b.cultureSignals.join("; ")}`,
    b.interviewProcess && `Interview process (as reported publicly): ${b.interviewProcess}`,
    b.techStack.length && `Tech stack: ${b.techStack.join(", ")}`,
    b.talkingPoints.length && `Talking points: ${b.talkingPoints.join(" | ")}`,
    `Research confidence: ${b.confidence}`,
  ].filter(Boolean) as string[];
  return lines.join("\n").slice(0, 4000);
}
