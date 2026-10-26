import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Contact from "@/app/models/Contact";
import Candidates from "@/app/models/Candidates";
import Referrer from "@/app/models/Referrer";
import { rankForUser } from "@/app/lib/matcher/hybrid";
import { companyKey } from "./linkedin";
import { companyKey as bankKey } from "@/app/lib/outcomes/companyKey";

/**
 * "Where do I know someone?" — the person's ranked feed, kept to postings at
 * companies where they have LinkedIn contacts, with whether they already
 * applied and whether verified insiders exist there. The working list for
 * the referral loop: apply, then write to the contact from the job page.
 */
export type Opportunity = {
  jobId: string;
  jobModel: "ExternalJobs";
  title: string;
  company: string;
  city?: string;
  remote?: boolean;
  logoUrl?: string;
  companyDomain?: string;
  applyUrl?: string;
  matchScore: number;
  reranked: boolean;
  why?: string;
  contacts: { _id: string; fullName: string; position: string; url: string }[];
  contactCount: number;
  insiders: number;
  applied: boolean;
};

/** Companies per person we look at (grouped, not one row per contact); a LinkedIn export rarely has more. */
const MAX_COMPANY_KEYS = 2000;
/** Contacts named per opportunity; `contactCount` carries the rest. */
const SAMPLE_CONTACTS = 3;

type ContactGroup = { key: string; n: number; sample: { _id: string; fullName: string; position: string; url: string }[] };

/** "wix" is one of the words of "wix com" (either direction) — a word-boundary check without a RegExp per pair. */
const wordOf = (phrase: string, word: string) => phrase === word || phrase.startsWith(word + " ") || phrase.endsWith(" " + word) || phrase.includes(" " + word + " ");
const fuzzyHas = (a: string, b: string) => !!a && !!b && (wordOf(a, b) || wordOf(b, a));

export async function referralOpportunities(userId: string, opts: { depth?: number; limit?: number } = {}): Promise<{ opportunities: Opportunity[]; scanned: number; contacts: number }> {
  await connectToDatabase();
  // One row per company the person knows someone at: count + a few names, never the whole address book.
  const [groups, contactTotal]: [ContactGroup[], number] = await Promise.all([
    Contact.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), companyKey: { $type: "string", $ne: "" } } },
      { $group: { _id: "$companyKey", n: { $sum: 1 }, sample: { $push: { _id: "$_id", fullName: "$fullName", position: "$position", url: "$url" } } } },
      { $sort: { n: -1, _id: 1 } },
      { $limit: MAX_COMPANY_KEYS },
      { $project: { _id: 0, key: "$_id", n: 1, sample: { $slice: ["$sample", SAMPLE_CONTACTS] } } },
    ]),
    Contact.countDocuments({ userId }),
  ]);
  if (!contactTotal) return { opportunities: [], scanned: 0, contacts: 0 };
  // Normalised once: exact lookup by key, and a word index for the fuzzy case ("wix" ↔ "wix com").
  const byKey = new Map<string, ContactGroup>();
  const byWord = new Map<string, ContactGroup[]>();
  for (const g of groups) {
    if (g.key.length < 2) continue;
    byKey.set(g.key, g);
    for (const w of g.key.split(" ")) if (w) byWord.set(w, [...(byWord.get(w) || []), g]);
  }
  const { jobs } = await rankForUser(userId, { limit: opts.depth ?? 300, rerank: false, includeApplied: true });
  const hits = jobs
    .map((j) => {
      const k = companyKey(j.company);
      const exact = byKey.get(k);
      if (exact) return { job: j, groups: [exact] };
      // Candidates share a word with the job's company; then the boundary check settles it.
      const seen = new Set<ContactGroup>();
      for (const w of k.split(" ")) for (const g of byWord.get(w) || []) if (fuzzyHas(g.key, k)) seen.add(g);
      return seen.size ? { job: j, groups: [...seen] } : null;
    })
    .filter(Boolean) as { job: any; groups: ContactGroup[] }[];
  const jobIds = hits.map((h) => h.job._id);
  const [apps, insiders]: [any[], any[]] = await Promise.all([
    Candidates.find({ candidateId: userId, jobId: { $in: jobIds } }).select("jobId").lean(),
    Referrer.aggregate([{ $match: { companyKey: { $in: [...new Set(hits.map((h) => bankKey(h.job.company)))] }, active: true, verifiedAt: { $ne: null } } }, { $group: { _id: "$companyKey", n: { $sum: 1 } } }]),
  ]);
  const applied = new Set(apps.map((a) => String(a.jobId)));
  const insidersOf = new Map(insiders.map((i) => [i._id, i.n]));
  const opportunities: Opportunity[] = hits.map(({ job, groups: gs }) => {
    const cs = gs.flatMap((g) => g.sample).slice(0, SAMPLE_CONTACTS);
    const contactCount = gs.reduce((s, g) => s + g.n, 0);
    return {
      jobId: job._id,
      jobModel: "ExternalJobs",
      title: job.job,
      company: job.company,
      city: job.city,
      remote: job.remote,
      logoUrl: job.logoUrl,
      companyDomain: job.companyDomain,
      applyUrl: job.applyUrl,
      matchScore: job.matchScore,
      reranked: !!job.reranked,
      why: job.why,
      contacts: cs.map((c) => ({ _id: String(c._id), fullName: c.fullName, position: c.position || "", url: c.url || "" })),
      contactCount,
      insiders: insidersOf.get(bankKey(job.company)) || 0,
      applied: applied.has(job._id),
    };
  });
  opportunities.sort((a, b) => b.matchScore - a.matchScore || b.contactCount - a.contactCount);
  return { opportunities: opportunities.slice(0, opts.limit ?? 60), scanned: jobs.length, contacts: contactTotal };
}
