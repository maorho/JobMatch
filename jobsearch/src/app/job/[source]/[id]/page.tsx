import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JobDescription from "@/app/components/JobDescription";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { jobPageJsonLd, jobPageRobots } from "@/app/lib/seo/jsonld";
import { excerpt } from "@/app/lib/seo/site";

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
    openGraph: { title, description, type: "article", url: `/job/${source}/${id}`, images: [{ url: "/hero.jpg", width: 1200, height: 630, alt: "JobMatch" }] },
    // Closed postings keep rendering but drop out of the index.
    robots: jobPageRobots(job),
  };
}

export default async function JobPage({ params }: { params: Params }) {
  const { source, id } = await params;
  const job = await loadJob(source, id);
  if (!job) notFound();
  const company = companyName(job);
  // No JobPosting for a closed job (active:false) — see jobPageJsonLd.
  const jsonLd = jobPageJsonLd({ ...job, _id: String(job._id), source: job.source, company });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <JobDescription job={job} />
    </>
  );
}
