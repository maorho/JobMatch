import { absolute } from "./site";

/**
 * Google's JobPosting structured data for a job page. Only facts we have;
 * Google rejects guessed salaries and fake validThrough dates, so neither
 * is emitted.
 */
export type JobForSeo = {
  _id: string;
  source: "internal" | "external";
  job: string;
  company: string;
  description: string;
  city?: string;
  country?: string;
  remote?: boolean;
  type?: string; // internal: On Site / Hybrid / Remote
  postedAt?: string | Date;
  createdAt?: string | Date;
  finalUrl?: string;
  url?: string;
  companyDomain?: string;
};

const employmentType = (title: string) => (/\b(intern|internship|student)\b/i.test(title) ? "INTERN" : /\bpart[- ]time\b/i.test(title) ? "PART_TIME" : /\b(contract|freelance|temporary)\b/i.test(title) ? "CONTRACTOR" : "FULL_TIME");

export function jobPostingJsonLd(job: JobForSeo): Record<string, unknown> {
  const posted = new Date(job.postedAt || job.createdAt || Date.now());
  const remote = job.remote || /remote/i.test(job.type || "") || /^remote$/i.test(job.country || "");
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.job,
    description: (job.description || "").slice(0, 5000) || job.job,
    datePosted: posted.toISOString().slice(0, 10),
    employmentType: employmentType(job.job),
    hiringOrganization: { "@type": "Organization", name: job.company, ...(job.companyDomain ? { sameAs: `https://${job.companyDomain}` } : {}) },
    identifier: { "@type": "PropertyValue", name: job.company, value: job._id },
    url: absolute(`/job/${job.source}/${job._id}`),
    directApply: job.source === "internal",
  };
  if (job.city || (job.country && job.country !== "Remote" && job.country !== "Unknown")) {
    out.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", ...(job.city ? { addressLocality: job.city } : {}), ...(job.country && job.country !== "Unknown" && job.country !== "Remote" ? { addressCountry: job.country } : {}) } };
  }
  if (remote) {
    out.jobLocationType = "TELECOMMUTE";
    if (!out.jobLocation) out.applicantLocationRequirements = { "@type": "Country", name: job.country && job.country !== "Remote" ? job.country : "Israel" };
  }
  return out;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}

export function articleJsonLd(a: { slug: string; title: string; excerpt: string; date: string; tags: string[] }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt,
    datePublished: a.date,
    inLanguage: "he",
    keywords: a.tags.join(", "),
    author: { "@type": "Organization", name: "JobMatch" },
    publisher: { "@type": "Organization", name: "JobMatch", logo: { "@type": "ImageObject", url: absolute("/favicon.png") } },
    mainEntityOfPage: absolute(`/Articels/${a.slug}`),
  };
}

/** FAQPage for the public part of a company's interview-question bank. */
export function faqJsonLd(items: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.question, acceptedAnswer: { "@type": "Answer", text: it.answer } })),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "JobMatch",
    url: absolute("/"),
    potentialAction: { "@type": "SearchAction", target: `${absolute("/")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
}
