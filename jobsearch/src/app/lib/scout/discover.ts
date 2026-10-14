import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import DiscoveryCandidate from "@/app/models/DiscoveryCandidate";
import ExternalJobs from "@/app/models/ExternalJobs";
import Contact from "@/app/models/Contact";
import Referrer from "@/app/models/Referrer";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { detectFromUrl, detectFromCareersPage, type DetectedSource } from "./detect";
import { normalizeDomain } from "./logo";
import { researchClient, callWithSearch, safeJson, type ResearchClient } from "@/app/lib/interview/companyResearch";

/**
 * Company discovery: the Scout grows the catalogue on its own.
 *
 * Where new names come from:
 *   - contacts: companies in the LinkedIn connections people imported
 *   - insiders: companies of verified referrers
 *   - search:   web search for Israeli tech companies whose careers pages sit on
 *               a known ATS (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Comeet)
 * How a name becomes a source: a careers URL is matched against the ATS patterns,
 * otherwise a few slug guesses are probed against the public ATS APIs (one cheap
 * GET each). A hit becomes a CompanySource; the Scout's next refresh ingests it.
 * Every candidate is remembered, so nothing is probed twice.
 */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type DiscoverDeps = {
  fetchImpl?: Fetch;
  detect?: (url: string) => Promise<DetectedSource | null>;
  client?: ResearchClient | null;
  log?: (line: string) => void;
};

/** Process-wide defaults for the deps (tests point them at fakes so the agent path never touches the network). */
let discoverDefaults: DiscoverDeps = {};
export function setDiscoverDefaults(d: DiscoverDeps | null) {
  discoverDefaults = d || {};
}
const withDefaults = <T extends DiscoverDeps>(opts: T): T => ({ ...discoverDefaults, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) }) as T;

const SUFFIX = /\b(ltd|inc|llc|corp|corporation|technologies|technology|tech|labs|lab|group|israel|il|software|solutions|systems|holdings|the|co|company|ai|io|com)\b\.?/g;

/** Slug guesses for a company name: "Moon Active Ltd" → moonactive, moon-active, moon. */
export function slugGuesses(name: string): string[] {
  const base = (name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];
  const words = base.split(" ").filter(Boolean);
  const out = new Set<string>();
  out.add(words.join(""));
  if (words.length > 1) {
    out.add(words.join("-"));
    out.add(words[0]);
  }
  // Keep the raw first token too ("monday.com" → monday is already there; "wix" → wix).
  const raw = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (raw && raw.length <= 24) out.add(raw);
  return [...out].filter((s) => s.length >= 3 && s.length <= 40).slice(0, 4);
}

type Probe = { atsType: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "recruitee" | "workable"; url: (slug: string) => string; board: (slug: string) => string; count: (json: any) => number };
const PROBES: Probe[] = [
  { atsType: "greenhouse", url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, board: (s) => `https://boards.greenhouse.io/${s}`, count: (j) => (Array.isArray(j?.jobs) ? j.jobs.length : 0) },
  { atsType: "lever", url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, board: (s) => `https://jobs.lever.co/${s}`, count: (j) => (Array.isArray(j) ? j.length : 0) },
  { atsType: "ashby", url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, board: (s) => `https://jobs.ashbyhq.com/${s}`, count: (j) => (Array.isArray(j?.jobs) ? j.jobs.length : 0) },
  { atsType: "smartrecruiters", url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings`, board: (s) => `https://jobs.smartrecruiters.com/${s}`, count: (j) => (Array.isArray(j?.content) ? j.content.length : 0) },
  { atsType: "recruitee", url: (s) => `https://${s}.recruitee.com/api/offers/`, board: (s) => `https://${s}.recruitee.com`, count: (j) => (Array.isArray(j?.offers) ? j.offers.length : 0) },
  { atsType: "workable", url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`, board: (s) => `https://apply.workable.com/${s}`, count: (j) => (Array.isArray(j?.jobs) ? j.jobs.length : 0) },
];

async function getJson(fetchImpl: Fetch, url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 JobMatchScout", Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" } as any);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type ProbeHit = DetectedSource & { jobs: number };

/** Try the public ATS APIs for one slug; the first board with postings wins. */
export async function probeSlug(slug: string, fetchImpl: Fetch = fetch, tried?: { ats: string; identifier: string; ok: boolean; at: Date }[]): Promise<ProbeHit | null> {
  for (const p of PROBES) {
    const json = await getJson(fetchImpl, p.url(slug));
    const n = json ? p.count(json) : 0;
    tried?.push({ ats: p.atsType, identifier: slug, ok: n > 0, at: new Date() });
    if (n > 0) return { atsType: p.atsType, identifier: slug, careersUrl: p.board(slug), jobs: n };
  }
  return null;
}

/** Company keys already covered: every source and every company with postings. */
async function knownKeys(): Promise<Set<string>> {
  const [sources, companies] = await Promise.all([CompanySource.find({}).select("companyName domain").lean() as any, ExternalJobs.distinct("company")]);
  const keys = new Set<string>();
  for (const s of sources) {
    keys.add(companyKey(s.companyName));
    if (s.domain) keys.add(companyKey(String(s.domain).replace(/\.[a-z.]+$/, "")));
  }
  for (const c of companies as string[]) if (c) keys.add(companyKey(c));
  return keys;
}

async function addCandidate(name: string, origin: "contacts" | "insiders" | "search" | "manual" | "postings", known: Set<string>, extra: { urlHints?: string[]; domain?: string } = {}): Promise<boolean> {
  const key = companyKey(name);
  if (!key || key.length < 2 || known.has(key)) return false;
  const r = await DiscoveryCandidate.updateOne(
    { key },
    { $setOnInsert: { key, name: name.trim().slice(0, 120), origin, status: "pending" }, ...(extra.urlHints?.length ? { $addToSet: { urlHints: { $each: extra.urlHints.slice(0, 5) } } } : {}), ...(extra.domain ? { $set: { domain: extra.domain } } : {}) },
    { upsert: true }
  );
  return r.upsertedCount > 0;
}

export function buildDiscoveryPrompt(topic: string): string {
  return `Find Israeli tech companies (HQ or R&D in Israel) that are hiring right now in the area of "${topic}" and whose careers page is hosted on one of these applicant tracking systems: Greenhouse (boards.greenhouse.io/<slug> or job-boards.greenhouse.io/<slug>), Lever (jobs.lever.co/<slug>), Ashby (jobs.ashbyhq.com/<slug>), SmartRecruiters (jobs.smartrecruiters.com/<slug>), Recruitee (<slug>.recruitee.com) or Comeet (comeet.com/jobs/<slug>/...).
Search the web (e.g. "site:boards.greenhouse.io Tel Aviv ${topic}", "site:jobs.lever.co Israel", "site:jobs.ashbyhq.com Israel", company careers pages). Return up to 25 companies you actually found, each with the careers URL you saw. Never invent URLs.
Return STRICT JSON only: {"companies":[{"name":"...","careersUrl":"https://...","domain":"company.com"}]}`;
}

const TOPICS = ["cyber security", "fintech", "AI and machine learning", "developer tools and cloud infrastructure", "healthtech and medical devices", "adtech and marketing technology", "e-commerce and retail tech", "automotive and mobility", "SaaS for business", "gaming and media", "semiconductors and hardware", "climate and agritech", "proptech and insurtech", "data and analytics"];

/** One web-search pass: companies with ATS careers pages for today's topic. */
export async function searchCandidates(known: Set<string>, deps: DiscoverDeps = {}): Promise<{ topic: string; found: number; added: number }> {
  const client = deps.client === undefined ? researchClient() : deps.client;
  const topic = TOPICS[Math.floor(Date.now() / 86_400_000) % TOPICS.length];
  if (!client) return { topic, found: 0, added: 0 };
  const { text } = await callWithSearch(client, buildDiscoveryPrompt(topic), { maxTokens: 2500 });
  const parsed: any = safeJson(text);
  const list: any[] = Array.isArray(parsed?.companies) ? parsed.companies : [];
  let added = 0;
  for (const c of list.slice(0, 40)) {
    const name = String(c?.name || "").trim();
    const url = String(c?.careersUrl || "").trim();
    if (!name) continue;
    if (await addCandidate(name, "search", known, { urlHints: /^https?:\/\//.test(url) ? [url] : [], domain: c?.domain ? normalizeDomain(String(c.domain)) : "" })) added++;
  }
  return { topic, found: list.length, added };
}

/** Pull new names from contacts, insiders and (optionally) a web search. */
export async function collectCandidates(rawDeps: DiscoverDeps & { search?: boolean } = {}): Promise<{ contacts: number; insiders: number; search: number; topic?: string }> {
  const deps = withDefaults(rawDeps);
  await connectToDatabase();
  const known = await knownKeys();
  const out = { contacts: 0, insiders: 0, search: 0, topic: undefined as string | undefined };
  const fromContacts: any[] = await Contact.aggregate([{ $match: { company: { $nin: ["", null] } } }, { $group: { _id: "$company", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 500 }]);
  for (const c of fromContacts) if (await addCandidate(c._id, "contacts", known)) out.contacts++;
  const fromInsiders: any[] = await Referrer.find({ verifiedAt: { $ne: null } }).select("company domain").lean();
  for (const r of fromInsiders) if (await addCandidate(r.company, "insiders", known, { domain: r.domain })) out.insiders++;
  if (deps.search !== false) {
    const s = await searchCandidates(known, deps).catch((e) => {
      deps.log?.(`search failed: ${(e as Error)?.message}`);
      return { topic: "", found: 0, added: 0 };
    });
    out.search = s.added;
    out.topic = s.topic;
  }
  return out;
}

/** Probe one candidate: URL hints first, then slug guesses, then the domain's careers page. */
export async function probeCandidate(c: any, rawDeps: DiscoverDeps = {}): Promise<ProbeHit | null> {
  const deps = withDefaults(rawDeps);
  const fetchImpl = deps.fetchImpl || fetch;
  const detect = deps.detect || detectFromCareersPage;
  const tried: { ats: string; identifier: string; ok: boolean; at: Date }[] = c.tried || [];
  for (const url of c.urlHints || []) {
    const fast = detectFromUrl(url);
    if (fast) {
      // Confirm the board actually has postings when we can (Comeet/Workday need their own adapters; trust the URL).
      const hit = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee", "workable"].includes(fast.atsType) ? await probeSlug(fast.identifier, fetchImpl, tried) : null;
      if (hit) return { ...hit, careersUrl: url };
      if (["comeet", "workday"].includes(fast.atsType) && fast.secondaryIdentifier) return { ...fast, jobs: 0 };
    }
    const det = await detect(url).catch(() => null);
    if (det) {
      tried.push({ ats: det.atsType, identifier: det.identifier, ok: true, at: new Date() });
      return { ...det, jobs: 0 };
    }
  }
  for (const slug of slugGuesses(c.name)) {
    if (tried.some((t) => t.identifier === slug)) continue;
    const hit = await probeSlug(slug, fetchImpl, tried);
    if (hit) return hit;
  }
  if (c.domain) {
    for (const path of ["careers", "jobs"]) {
      const det = await detect(`https://${c.domain}/${path}`).catch(() => null);
      if (det) {
        tried.push({ ats: det.atsType, identifier: det.identifier, ok: true, at: new Date() });
        return { ...det, jobs: 0 };
      }
    }
  }
  c.tried = tried;
  return null;
}

export type DiscoverResult = { collected: { contacts: number; insiders: number; search: number; topic?: string }; probed: number; found: { name: string; atsType: string; identifier: string; jobs: number }[]; notFound: number; pending: number };

/** The whole pass: collect new names, probe up to `limit` of the pending ones, add the hits as sources. */
export async function discoverCompanies(rawOpts: { limit?: number; search?: boolean } & DiscoverDeps = {}): Promise<DiscoverResult> {
  const opts = withDefaults(rawOpts);
  await connectToDatabase();
  const collected = await collectCandidates(opts);
  const limit = opts.limit ?? 20;
  const batch: any[] = await DiscoveryCandidate.find({ status: "pending", attempts: { $lt: 3 } }).sort({ createdAt: 1 }).limit(limit).lean();
  const found: DiscoverResult["found"] = [];
  let notFound = 0;
  for (const c of batch) {
    const hit = await probeCandidate(c, opts).catch((e) => {
      opts.log?.(`${c.name}: probe failed — ${(e as Error)?.message}`);
      return null;
    });
    if (hit) {
      const source: any = await CompanySource.findOneAndUpdate(
        { atsType: hit.atsType, identifier: hit.identifier },
        { $set: { companyName: c.name, atsType: hit.atsType, identifier: hit.identifier, ...(hit.secondaryIdentifier ? { secondaryIdentifier: hit.secondaryIdentifier } : {}), careersUrl: hit.careersUrl, ...(c.domain ? { domain: normalizeDomain(c.domain) } : {}), enabled: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await DiscoveryCandidate.updateOne({ _id: c._id }, { $set: { status: "found", sourceId: source._id, tried: c.tried || [], lastTriedAt: new Date(), note: `${hit.atsType}/${hit.identifier}${hit.jobs ? ` · ${hit.jobs} postings` : ""}` }, $inc: { attempts: 1 } });
      found.push({ name: c.name, atsType: hit.atsType, identifier: hit.identifier, jobs: hit.jobs });
      opts.log?.(`✓ ${c.name} → ${hit.atsType}/${hit.identifier}${hit.jobs ? ` (${hit.jobs} postings)` : ""}`);
    } else {
      const attempts = (c.attempts || 0) + 1;
      await DiscoveryCandidate.updateOne({ _id: c._id }, { $set: { status: attempts >= 3 ? "not_found" : "pending", tried: c.tried || [], lastTriedAt: new Date() }, $inc: { attempts: 1 } });
      notFound++;
    }
  }
  const pending = await DiscoveryCandidate.countDocuments({ status: "pending", attempts: { $lt: 3 } });
  return { collected, probed: batch.length, found, notFound, pending };
}
