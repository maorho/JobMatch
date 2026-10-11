import type { MetadataRoute } from "next";
import { connectToDatabase } from "./lib/db";
import ExternalJobs from "./models/ExternalJobs";
import Job from "./models/Job";
import { listArticles } from "./lib/content/articles";
import { companiesWithQuestions } from "./lib/outcomes/questions";
import { siteUrl } from "./lib/seo/site";

export const revalidate = 3600;

const MAX_JOBS = 5000;

/** Static pages, every article, and the freshest jobs (Google caps a sitemap at 50k URLs; we stay far below). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const SITE_URL = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/Companies`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/Articels`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/interview-questions`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/About`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/ContactUs`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/TermsOfConditions`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];
  try {
    for (const a of await listArticles()) entries.push({ url: `${SITE_URL}/Articels/${a.slug}`, lastModified: new Date(a.date), changeFrequency: "monthly", priority: 0.6 });
    await connectToDatabase();
    const [external, internal]: [any[], any[]] = await Promise.all([
      ExternalJobs.find({}).select("_id updatedAt firstSeenAt").sort({ firstSeenAt: -1 }).limit(MAX_JOBS).lean(),
      Job.find({}).select("_id updatedAt").limit(500).lean(),
    ]);
    for (const j of external) entries.push({ url: `${SITE_URL}/job/external/${j._id}`, lastModified: j.updatedAt || j.firstSeenAt || now, changeFrequency: "daily", priority: 0.5 });
    for (const j of internal) entries.push({ url: `${SITE_URL}/job/internal/${j._id}`, lastModified: j.updatedAt || now, changeFrequency: "daily", priority: 0.6 });
    for (const c of await companiesWithQuestions(1000)) entries.push({ url: `${SITE_URL}/interview-questions/${encodeURIComponent(c.companyKey)}`, lastModified: c.lastAskedAt || now, changeFrequency: "weekly", priority: 0.7 });
  } catch (e) {
    console.warn("[sitemap] partial (DB unavailable):", (e as Error)?.message);
  }
  return entries;
}
