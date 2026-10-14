import * as cheerio from "cheerio";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";

/**
 * What the agent can learn about a company before the LLM step:
 *  - tech-stack signals mined from the company's OTHER postings in our catalog
 *  - a short text excerpt from the company website (best-effort, 5s budget)
 *  - the company domain / careers page we already know
 */
export type CompanyContext = {
  company: string;
  domain?: string;
  openRoles: number;
  techSignals: { term: string; count: number }[];
  sampleTitles: string[];
  websiteExcerpt?: string;
};

const TECH_TERMS = [
  "react", "next.js", "nextjs", "angular", "vue", "typescript", "javascript", "node.js", "nodejs", "python", "django", "fastapi", "flask",
  "java", "spring", "kotlin", "go", "golang", "rust", "c++", "c#", ".net", "scala", "ruby", "rails", "php", "swift", "objective-c",
  "sql", "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "kafka", "rabbitmq", "graphql", "rest",
  "aws", "gcp", "azure", "kubernetes", "k8s", "docker", "terraform", "ci/cd", "jenkins", "github actions", "linux",
  "machine learning", "deep learning", "pytorch", "tensorflow", "llm", "nlp", "computer vision", "data science", "spark", "airflow",
  "microservices", "distributed systems", "system design", "security", "devops", "sre", "embedded", "firmware", "verilog", "fpga",
  "mobile", "android", "ios", "react native", "flutter", "qa", "automation", "selenium", "playwright", "cypress",
];

export function mineTechSignals(texts: string[]): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const hay = ` ${(t || "").toLowerCase()} `;
    for (const term of TECH_TERMS) {
      const re = new RegExp(`(^|[^a-z0-9+#.])${term.replace(/[.+#/]/g, (m) => "\\" + m)}(?=$|[^a-z0-9+#])`, "g");
      const n = (hay.match(re) || []).length;
      if (n) counts.set(term, (counts.get(term) || 0) + n);
    }
  }
  return [...counts.entries()].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 15);
}

async function fetchWebsiteExcerpt(domain: string): Promise<string | undefined> {
  const urls = [`https://${domain}`, `https://www.${domain}`];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(timer);
      if (!res.ok) continue;
      const $ = cheerio.load(await res.text());
      $("script,style,nav,footer,noscript,svg").remove();
      const meta = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
      const title = $("title").first().text();
      const body = $("main, article, body").first().text().replace(/\s+/g, " ").trim();
      const excerpt = [title, meta, body].filter(Boolean).join(" — ").slice(0, 2500);
      if (excerpt.length > 80) return excerpt;
    } catch {
      /* next url */
    }
  }
  return undefined;
}

export async function gatherCompanyContext(company: string, opts: { fetchWebsite?: boolean } = {}): Promise<CompanyContext> {
  await connectToDatabase();
  const [jobs, source]: [any[], any] = await Promise.all([
    ExternalJobs.find({ company, ...OPEN_JOBS }).select("job description companyDomain").limit(40).lean(),
    CompanySource.findOne({ companyName: company }).select("domain careersUrl").lean(),
  ]);
  const domain = (source?.domain || jobs.find((j) => j.companyDomain)?.companyDomain || "").replace(/^www\./, "") || undefined;
  const ctx: CompanyContext = {
    company,
    domain,
    openRoles: jobs.length,
    techSignals: mineTechSignals(jobs.map((j) => `${j.job}\n${j.description || ""}`)),
    sampleTitles: jobs.slice(0, 8).map((j) => j.job),
  };
  if (opts.fetchWebsite !== false && domain) ctx.websiteExcerpt = await fetchWebsiteExcerpt(domain);
  return ctx;
}
