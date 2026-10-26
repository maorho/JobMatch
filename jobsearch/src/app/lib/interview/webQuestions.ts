import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import WebInterviewQuestion, { WebQuestionHarvest } from "@/app/models/WebInterviewQuestion";
import ExternalJobs from "@/app/models/ExternalJobs";
import { QUESTION_STAGES } from "@/app/models/InterviewQuestion";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { questionKey } from "@/app/lib/outcomes/questions";
import { callWithSearch, repairJsonAs, researchClient, safeJson, RESEARCH_MODEL, type ResearchClient } from "./companyResearch";
import { memo, ttl } from "@/app/lib/cache";
import { harvestState, WEB_QUESTIONS_INFLIGHT_MS, type HarvestState } from "./harvestState";

/**
 * Web-questions harvest: what candidates report *publicly* about a company's
 * interviews (Glassdoor interview reviews, Reddit, Blind, LinkedIn/Medium
 * posts, Hebrew forums, the company's own process pages). Runs the OpenAI
 * web-search tool once per company per month and stores one row per distinct
 * question (WebInterviewQuestion). The bank merges these with what our own
 * candidates reported, always labelled by provenance.
 */
export { WEB_QUESTIONS_TTL_DAYS, WEB_QUESTIONS_RETRY_MS, WEB_QUESTIONS_INFLIGHT_MS } from "./harvestState";
export const WEB_QUESTIONS_MODEL = process.env.WEB_QUESTIONS_MODEL || RESEARCH_MODEL;

const str = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const itemSchema = z.object({
  question: str.pipe(z.string().min(3).max(600)),
  stage: z.preprocess((v) => (QUESTION_STAGES.includes(String(v) as any) ? String(v) : "other"), z.enum(QUESTION_STAGES)).default("other"),
  topic: str.pipe(z.string().max(60)).default(""),
  roleTitle: str.pipe(z.string().max(80)).default(""),
  sourceUrl: str.pipe(z.string().max(500)).default(""),
  sourceName: str.pipe(z.string().max(60)).default(""),
});
export type WebQuestion = z.infer<typeof itemSchema>;
/** Lenient: one malformed entry (empty question, odd shape) drops that entry, not the whole harvest. */
const outSchema = z.object({
  questions: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 60).map((it) => itemSchema.safeParse(it)).filter((r) => r.success).map((r) => (r as { data: WebQuestion }).data) : []), z.array(itemSchema)).default([]),
  processNotes: str.pipe(z.string().max(1000)).default(""),
});

const SHAPE = `{"questions":[{"question","stage":"hr|technical|final|other","topic","roleTitle","sourceUrl","sourceName"}],"processNotes"}`;

export function buildWebQuestionsPrompt(company: string, hints?: { domain?: string; sampleTitles?: string[] }): string {
  return `Find interview questions that candidates report being asked at the company "${company}"${hints?.domain ? ` (website: ${hints.domain})` : ""}${hints?.sampleTitles?.length ? ` — they currently hire for roles like ${hints.sampleTitles.slice(0, 4).join(", ")}` : ""}.
Search broadly: Glassdoor "interview" reviews, Reddit (r/cscareerquestions, r/Israel_tech and similar), Blind, LinkedIn and Medium posts, YouTube video descriptions, Hebrew sources (e.g. "ראיון עבודה ב-${company}", "שאלות ראיון ${company}", forums and public Facebook group posts), and the company's own careers / engineering pages that describe their process.
Rules:
- Include ONLY questions that a source actually reports as asked at this company — a quote or close paraphrase in the source's language (Hebrew or English). Never invent generic questions, never pad the list.
- One entry per distinct question; merge duplicates. Up to 40.
- "stage": hr (recruiter / HR screen, background, salary, behavioural), technical (coding, system design, home assignment, technical knowledge), final (hiring manager, culture fit, last round), other.
- "topic": 1–3 words (e.g. "React hooks", "system design", "salary expectations"). "roleTitle": the role if the source states it, else "".
- "sourceUrl": the page URL where it was reported; "sourceName": the site (e.g. "glassdoor.com", "reddit.com").
- "processNotes": one or two sentences on how candidates describe the process (stages, home assignment, duration), or "".
If nothing is found, return {"questions":[],"processNotes":""}.
Return STRICT JSON only: ${SHAPE}`;
}

export type HarvestResult = { company: string; companyKey: string; found: number; created: number; searched: boolean; cached: boolean; processNotes: string };

/** Record a failed attempt (keeps any earlier successful harvest's data) and clear the in-flight marker. */
async function recordFailedAttempt(key: string, name: string, error: string) {
  await WebQuestionHarvest.findOneAndUpdate(
    { companyKey: key },
    { $set: { attemptedAt: new Date(), harvestStartedAt: null, error: error.slice(0, 300) }, $setOnInsert: { companyKey: key, company: name } },
    { upsert: true }
  ).catch((e: any) => console.warn("[webQuestions] could not record attempt:", e?.message));
}

/**
 * Atomically mark a harvest as started, unless one started less than
 * WEB_QUESTIONS_INFLIGHT_MS ago. Returns false when someone else holds it.
 */
export async function claimWebQuestionsHarvest(company: string): Promise<boolean> {
  const name = (company || "").trim();
  if (!name) return false;
  await connectToDatabase();
  const key = companyKey(name);
  try {
    const row = await WebQuestionHarvest.findOneAndUpdate(
      { companyKey: key, $or: [{ harvestStartedAt: null }, { harvestStartedAt: { $lt: new Date(Date.now() - WEB_QUESTIONS_INFLIGHT_MS) } }] },
      { $set: { harvestStartedAt: new Date() }, $setOnInsert: { company: name } },
      { upsert: true, new: true }
    ).lean();
    return !!row;
  } catch (e: any) {
    if (e?.code === 11000) return false; // the row exists with a fresh marker: another visit claimed it
    throw e;
  }
}

/**
 * Harvest once per company per WEB_QUESTIONS_TTL_DAYS. Returns null when no
 * client is available (no key / tests), when a recent attempt failed (back-off),
 * or when another harvest for the company is already running. Every attempt is
 * recorded, so a failure doesn't make the company "due" on every call.
 * `claimed`: the caller already took the in-flight marker (claimWebQuestionsHarvest).
 */
export async function harvestWebQuestions(company: string, opts: { domain?: string; sampleTitles?: string[]; client?: ResearchClient; force?: boolean; claimed?: boolean } = {}): Promise<HarvestResult | null> {
  const name = (company || "").trim();
  if (!name) return null;
  await connectToDatabase();
  const key = companyKey(name);
  if (!opts.force) {
    const prev: any = await WebQuestionHarvest.findOne({ companyKey: key }).lean();
    const st = harvestState(prev);
    if (prev && st.fresh) return { company: prev.company, companyKey: key, found: prev.found, created: 0, searched: !!prev.searched, cached: true, processNotes: prev.processNotes || "" };
    if (st.backingOff) return null;
    if (st.inFlight && !opts.claimed) return null;
  }
  const client = opts.client || researchClient();
  if (!client) {
    await recordFailedAttempt(key, name, "no research client");
    return null;
  }
  if (!opts.claimed && !opts.force && !(await claimWebQuestionsHarvest(name))) return null;

  try {
    return await runHarvest(client, name, key, opts);
  } catch (e) {
    await recordFailedAttempt(key, name, `search failed: ${(e as Error)?.message || String(e)}`);
    throw e;
  }
}

async function runHarvest(client: ResearchClient, name: string, key: string, opts: { domain?: string; sampleTitles?: string[] }): Promise<HarvestResult> {
  const { text, searched } = await callWithSearch(client, buildWebQuestionsPrompt(name, { domain: opts.domain, sampleTitles: opts.sampleTitles }), { model: WEB_QUESTIONS_MODEL, maxTokens: 4000 });
  let parsed = outSchema.safeParse(safeJson(text));
  if (!parsed.success) {
    const repaired = await repairJsonAs(client, text, SHAPE).catch(() => "");
    parsed = outSchema.safeParse(safeJson(repaired));
  }
  if (!parsed.success) {
    await WebQuestionHarvest.findOneAndUpdate({ companyKey: key }, { $set: { companyKey: key, company: name, harvestedAt: new Date(), attemptedAt: new Date(), harvestStartedAt: null, found: 0, created: 0, searched, model: WEB_QUESTIONS_MODEL, error: `invalid output: ${String(text).slice(0, 200).replace(/\s+/g, " ")}` } }, { upsert: true });
    return { company: name, companyKey: key, found: 0, created: 0, searched, cached: false, processNotes: "" };
  }

  let created = 0;
  const seen = new Set<string>();
  for (const q of parsed.data.questions) {
    const k = questionKey(q.question);
    if (!k || seen.has(`${q.stage}:${k}`)) continue;
    seen.add(`${q.stage}:${k}`);
    const r = await WebInterviewQuestion.updateOne(
      { companyKey: key, stage: q.stage, key: k },
      {
        $setOnInsert: { company: name, companyKey: key, stage: q.stage, key: k, question: q.question, topic: q.topic, roleTitle: q.roleTitle, sourceUrl: q.sourceUrl, sourceName: q.sourceName || hostOf(q.sourceUrl), language: /[֐-׿]/.test(q.question) ? "he" : "en" },
        $set: { harvestedAt: new Date() },
      },
      { upsert: true }
    );
    if (r.upsertedCount) created++;
  }
  const found = seen.size;
  await WebQuestionHarvest.findOneAndUpdate({ companyKey: key }, { $set: { companyKey: key, company: name, harvestedAt: new Date(), attemptedAt: new Date(), harvestStartedAt: null, found, created, searched, model: WEB_QUESTIONS_MODEL, processNotes: parsed.data.processNotes, error: "" } }, { upsert: true });
  return { company: name, companyKey: key, found, created, searched, cached: false, processNotes: parsed.data.processNotes };
}

/** Never throws: harvest if due, otherwise return quickly. Safe to call from prep flows and pages. */
export async function ensureWebQuestions(company: string, opts: { domain?: string; sampleTitles?: string[]; client?: ResearchClient; claimed?: boolean } = {}): Promise<HarvestResult | null> {
  try {
    return await harvestWebQuestions(company, opts);
  } catch (e) {
    console.warn("[webQuestions] harvest failed:", (e as Error)?.message);
    return null;
  }
}

/** Harvest scheduling state for a company (fresh / in flight / backing off / due). */
export async function webQuestionsStatus(company: string): Promise<HarvestState> {
  await connectToDatabase();
  const prev: any = await WebQuestionHarvest.findOne({ companyKey: companyKey(company) }).select("harvestedAt attemptedAt harvestStartedAt error").lean();
  return harvestState(prev);
}

/**
 * Is a harvest due (never run or older than the TTL, nothing running, and no
 * recent failed attempt)? Cheap check for pages that refresh in the background.
 */
export async function webQuestionsDue(company: string): Promise<boolean> {
  return (await webQuestionsStatus(company)).due;
}

/** Can a harvest run at all here (a research client is configured)? */
export function webQuestionsAvailable(): boolean {
  return !!researchClient();
}

/** The catalog's display name for a company slug (the bank pages are addressed by companyKey). */
export async function companyNameForKey(key: string): Promise<string | null> {
  await connectToDatabase();
  const names = await memo("company-names", ttl(5 * 60_000), async () => (await ExternalJobs.distinct("company")) as string[]);
  return names.find((n) => n && companyKey(n) === key) || null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, 60);
  } catch {
    return "";
  }
}
