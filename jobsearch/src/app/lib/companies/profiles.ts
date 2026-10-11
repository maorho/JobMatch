import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import CompanyProfile from "@/app/models/CompanyProfile";
import ExternalJobs from "@/app/models/ExternalJobs";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { callWithSearch, repairJsonAs, researchClient, safeJson, type ResearchClient } from "@/app/lib/interview/companyResearch";

/**
 * Company profiles for the Companies page: "what does this company do?" in
 * two Hebrew sentences, plus industry / HQ / size. The Researcher agent fills
 * them in batches (`companies.describe`), biggest employers first, and
 * refreshes each one every PROFILE_TTL_DAYS. With an OpenAI key the answer
 * comes from web search; without one (tests, offline) it is distilled from
 * the company description the ATS ships with the postings.
 */
export const PROFILE_TTL_DAYS = 60;
export const PROFILE_MODEL = process.env.COMPANY_PROFILE_MODEL || "gpt-4o-mini";

const str = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const profileSchema = z.object({
  summary: str.pipe(z.string().max(400)),
  industry: str.pipe(z.string().max(60)).default(""),
  hq: str.pipe(z.string().max(80)).default(""),
  founded: str.pipe(z.string().max(12)).default(""),
  size: str.pipe(z.string().max(60)).default(""),
  website: str.pipe(z.string().max(200)).default(""),
  sources: z.preprocess((v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 6) : []), z.array(z.string())).default([]),
  confidence: z.preprocess((v) => (["high", "medium", "low"].includes(String(v)) ? String(v) : "medium"), z.enum(["high", "medium", "low"])).default("medium"),
});
export type ProfileData = z.infer<typeof profileSchema>;
const SHAPE = `{"summary","industry","hq","founded","size","website","sources":[],"confidence":"high|medium|low"}`;

export type CompanyHints = { domain?: string; atsDescription?: string; sampleTitles?: string[]; openRoles?: number };

export function buildProfilePrompt(name: string, hints: CompanyHints = {}): string {
  return `Describe the company "${name}"${hints.domain ? ` (website: ${hints.domain})` : ""} for job seekers in Israel.
${hints.atsDescription ? `Their own blurb from a job posting: """${hints.atsDescription.slice(0, 1200)}"""\n` : ""}${hints.sampleTitles?.length ? `They currently hire for: ${hints.sampleTitles.slice(0, 5).join(", ")}${hints.openRoles ? ` (${hints.openRoles} open roles)` : ""}.\n` : ""}Search the web to confirm what they actually do, where they are based, how big they are and when they were founded.
Return STRICT JSON only: ${SHAPE}
- "summary": in HEBREW, at most two short sentences (under 220 characters): what they build/sell and for whom, plainly, no marketing adjectives.
- "industry": in Hebrew, 1–3 words (e.g. "סייבר", "פינטק", "בריאות דיגיטלית", "SaaS לניהול עבודה").
- "hq": city, country. "founded": year or "". "size": employee range or "". "website": the main site.
- "sources": up to 4 URLs you relied on. "confidence": high only with current sources.
If you cannot identify the company with confidence, keep the summary to what the posting blurb says and set confidence to "low".`;
}

/** Offline fallback: the first ~220 characters of the ATS company description, cut on a sentence boundary. */
export function summaryFromAtsDescription(text: string): string {
  const clean = (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 20) return "";
  if (clean.length <= 220) return clean;
  const cut = clean.slice(0, 220);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "…").trim();
}

export type DescribeResult = { key: string; name: string; summary: string; source: "web" | "ats" | "model"; confidence: "high" | "medium" | "low"; cached: boolean };

/** Write (or refresh) one company's profile. Returns null when there is nothing to say (no client and no ATS blurb). */
export async function describeCompany(name: string, opts: CompanyHints & { client?: ResearchClient; force?: boolean } = {}): Promise<DescribeResult | null> {
  const clean = (name || "").trim();
  if (!clean) return null;
  await connectToDatabase();
  const key = companyKey(clean);
  if (!opts.force) {
    const prev: any = await CompanyProfile.findOne({ key, updatedAt: { $gt: new Date(Date.now() - PROFILE_TTL_DAYS * 864e5) } }).lean();
    if (prev) return { key, name: prev.name, summary: prev.summary, source: prev.source, confidence: prev.confidence, cached: true };
  }
  const client = opts.client || researchClient();
  let data: ProfileData | null = null;
  let source: "web" | "ats" | "model" = "ats";
  if (client) {
    const { text, searched } = await callWithSearch(client, buildProfilePrompt(clean, opts), { model: PROFILE_MODEL, maxTokens: 900 });
    let parsed = profileSchema.safeParse(safeJson(text));
    if (!parsed.success) parsed = profileSchema.safeParse(safeJson(await repairJsonAs(client, text, SHAPE).catch(() => "")));
    if (parsed.success && parsed.data.summary.trim()) {
      data = parsed.data;
      source = searched ? "web" : "model";
      if (!searched && data.confidence === "high") data.confidence = "medium";
    }
  }
  if (!data) {
    const summary = summaryFromAtsDescription(opts.atsDescription || "");
    if (!summary) return null;
    data = { summary, industry: "", hq: "", founded: "", size: "", website: opts.domain ? `https://${opts.domain}` : "", sources: [], confidence: "low" };
    source = "ats";
  }
  await CompanyProfile.findOneAndUpdate(
    { key },
    { $set: { key, name: clean, domain: opts.domain || "", ...data, source, model: client ? PROFILE_MODEL : "", updatedAt: new Date() } },
    { upsert: true }
  );
  return { key, name: clean, summary: data.summary, source, confidence: data.confidence, cached: false };
}

/** Companies in the catalog (by open roles), with the hints a profile needs. */
export async function catalogCompanies(limit = 2000): Promise<{ name: string; jobs: number; domain: string; atsDescription: string; sampleTitles: string[] }[]> {
  await connectToDatabase();
  const rows: any[] = await ExternalJobs.aggregate([
    { $match: { company: { $nin: ["", null] } } },
    { $group: { _id: "$company", jobs: { $sum: 1 }, domain: { $max: "$companyDomain" }, desc: { $max: "$company_description" }, titles: { $push: "$job" } } },
    { $sort: { jobs: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 1, jobs: 1, domain: 1, desc: 1, titles: { $slice: ["$titles", 5] } } },
  ]);
  return rows.map((r) => ({ name: r._id, jobs: r.jobs, domain: r.domain || "", atsDescription: typeof r.desc === "string" ? r.desc : "", sampleTitles: (r.titles || []).filter(Boolean) }));
}

/** Fill in the profiles that are missing or older than the TTL, biggest employers first, `limit` per call. */
export async function describeMissingCompanies(opts: { limit?: number; client?: ResearchClient; log?: (line: string) => void } = {}): Promise<{ considered: number; due: number; described: number; skipped: number; failed: number; names: string[] }> {
  const limit = opts.limit ?? 15;
  const companies = await catalogCompanies();
  const fresh = new Set<string>(((await CompanyProfile.find({ updatedAt: { $gt: new Date(Date.now() - PROFILE_TTL_DAYS * 864e5) } }).select("key").lean()) as any[]).map((p) => p.key));
  const due = companies.filter((c) => !fresh.has(companyKey(c.name)));
  const out = { considered: companies.length, due: due.length, described: 0, skipped: 0, failed: 0, names: [] as string[] };
  for (const c of due.slice(0, limit)) {
    try {
      const r = await describeCompany(c.name, { domain: c.domain, atsDescription: c.atsDescription, sampleTitles: c.sampleTitles, openRoles: c.jobs, client: opts.client });
      if (r) {
        out.described++;
        out.names.push(c.name);
        opts.log?.(`${c.name}: ${r.summary.slice(0, 80)}${r.summary.length > 80 ? "…" : ""} (${r.source}, ${r.confidence})`);
      } else out.skipped++;
    } catch (e) {
      out.failed++;
      opts.log?.(`${c.name}: failed — ${(e as Error)?.message}`);
    }
  }
  return out;
}

/** Profiles for a list of company names, keyed by name (for the Companies API). */
export async function profilesFor(names: string[]): Promise<Map<string, { summary: string; industry: string; hq: string; size: string; founded: string; confidence: string }>> {
  await connectToDatabase();
  const keys = [...new Set(names.map((n) => companyKey(n)))];
  const rows: any[] = await CompanyProfile.find({ key: { $in: keys } }).select("key summary industry hq size founded confidence").lean();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = new Map<string, { summary: string; industry: string; hq: string; size: string; founded: string; confidence: string }>();
  for (const n of names) {
    const p = byKey.get(companyKey(n));
    if (p) out.set(n, { summary: p.summary, industry: p.industry, hq: p.hq, size: p.size, founded: p.founded, confidence: p.confidence });
  }
  return out;
}
