import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JobDescription from "@/app/components/JobDescription";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { jobPageJsonLd, jobPageRobots } from "@/app/lib/seo/jsonld";
import { excerpt } from "@/app/lib/seo/site";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { variantOf, type Variant } from "@/app/lib/jobs/variants";

/** The same role at the company's other locations (open listings only), for the "also offered in" row. */
async function siblingsOf(job: any): Promise<Variant[]> {
  if (job?.source !== "external" || !job?.titleKey) return [];
  const rows: any[] = await ExternalJobs.find({ ...OPEN_JOBS, company: job.company, titleKey: job.titleKey, _id: { $ne: job._id } }).select("city country remote").limit(40).lean().catch(() => []);
  return rows.map(variantOf);
}

export const dynamic = "force-dynamic";

type Params = Promise<{ source: string; id: string }>;

const companyName = (job: any) => (job?.source === "internal" ? job?.company?.companyName : job?.company) || "";

/** Server-rendered so crawlers get the title, description and JobPosting data; the interactive parts stay client-side. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { source, id } = await params;
  const job = await loadJob(source, id);
  if (!job) return { title: "Job not found", robots: { index: false } };
  const company = companyName(job);
  const where = [job.city, job.country].filter((v) => v && v !== "Unknown").join(", ");
  const title = `${job.job} — ${company}${where ? ` (${where})` : ""}`;
  const description = excerpt(job.description || `${job.job} at ${company}.`, 160);
  return {
    title,
    description,
    alternates: { canonical: `/job/${source}/${id}` },
    // Per-page openGraph replaces the root one, so the image must be repeated here.
    openGraph: { title, description, type: "article", url: `/job/${source}/${id}`, images: [{ url: "/og.png", width: 1200, height: 630, alt: "JobMatch" }] },
    // Closed postings keep rendering but drop out of the index.
    robots: jobPageRobots(job),
  };
}

export default async function JobPage({ params }: { params: Params }) {
  const { source, id } = await params;
  const job = await loadJob(source, id);
  if (!job) notFound();
  const company = companyName(job);
  const siblings = await siblingsOf(job);
  // No JobPosting for a closed job (active:false) — see jobPageJsonLd.
  const jsonLd = jobPageJsonLd({ ...job, _id: String(job._id), source: job.source, company });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <JobDescription job={siblings.length ? { ...job, siblings } : job} />
    </>
  );
}
