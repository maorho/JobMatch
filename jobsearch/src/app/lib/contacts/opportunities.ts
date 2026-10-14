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

const fuzzyHas = (a: string, b: string) => !!a && !!b && (a === b || new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(a) || new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(b));

export async function referralOpportunities(userId: string, opts: { depth?: number; limit?: number } = {}): Promise<{ opportunities: Opportunity[]; scanned: number; contacts: number }> {
  await connectToDatabase();
  const contacts: any[] = await Contact.find({ userId }).select("fullName position url companyKey").lean();
  if (!contacts.length) return { opportunities: [], scanned: 0, contacts: 0 };
  const byKey = new Map<string, any[]>();
  for (const c of contacts) {
    if (!c.companyKey || c.companyKey.length < 2) continue;
    byKey.set(c.companyKey, [...(byKey.get(c.companyKey) || []), c]);
  }
  const keys = [...byKey.keys()];
  const { jobs } = await rankForUser(userId, { limit: opts.depth ?? 300, rerank: false, includeApplied: true });
  const hits = jobs
    .map((j) => {
      const k = companyKey(j.company);
      const exact = byKey.get(k);
      const matched = exact || keys.filter((ck) => fuzzyHas(ck, k)).flatMap((ck) => byKey.get(ck) || []);
      return matched.length ? { job: j, contacts: matched } : null;
    })
    .filter(Boolean) as { job: any; contacts: any[] }[];
  const jobIds = hits.map((h) => h.job._id);
  const [apps, insiders]: [any[], any[]] = await Promise.all([
    Candidates.find({ candidateId: userId, jobId: { $in: jobIds } }).select("jobId").lean(),
    Referrer.aggregate([{ $match: { companyKey: { $in: [...new Set(hits.map((h) => bankKey(h.job.company)))] }, active: true, verifiedAt: { $ne: null } } }, { $group: { _id: "$companyKey", n: { $sum: 1 } } }]),
  ]);
  const applied = new Set(apps.map((a) => String(a.jobId)));
  const insidersOf = new Map(insiders.map((i) => [i._id, i.n]));
  const opportunities: Opportunity[] = hits.map(({ job, contacts: cs }) => {
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
      contacts: cs.slice(0, 4).map((c) => ({ _id: String(c._id), fullName: c.fullName, position: c.position || "", url: c.url || "" })),
      contactCount: cs.length,
      insiders: insidersOf.get(bankKey(job.company)) || 0,
      applied: applied.has(job._id),
    };
  });
  opportunities.sort((a, b) => b.matchScore - a.matchScore || b.contactCount - a.contactCount);
  return { opportunities: opportunities.slice(0, opts.limit ?? 60), scanned: jobs.length, contacts: contacts.length };
}
