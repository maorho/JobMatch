"use client";
import useSWR from "swr";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";
import CompanyLogo from "@/app/components/CompanyLogo";

type Saved = { jobId: string; jobModel: string; savedAt: string; title: string; company: string; city: string; remote: boolean; logoUrl: string; companyDomain: string; gone: boolean; matchScore: number | null };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Dashboard: the postings the person bookmarked from the feed. */
export default function SavedJobsCard() {
  const { data, mutate } = useSWR<{ jobs: Saved[] }>("/api/jobs/signals?list=saved", fetcher);
  if (!data || data.jobs.length === 0) return null;
  const unsave = async (jobId: string, jobModel: string) => {
    await fetch("/api/jobs/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, jobModel, kind: "saved", on: false }) });
    mutate();
  };
  return (
    <section id="saved" className="jm-card p-5 sm:p-6" dir="rtl">
      <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Bookmark className="h-5 w-5 text-teal" /> משרות ששמרת</h2>
      <p className="jm-muted mb-3">{data.jobs.length} משרות. משרה שנסגרה מסומנת.</p>
      <ul className="divide-y divide-line">
        {data.jobs.map((j) => (
          <li key={j.jobId} className="py-2.5 flex items-center gap-3">
            <CompanyLogo name={j.company} domain={j.companyDomain} logoUrl={j.logoUrl} className="h-9 w-9 rounded-lg border border-line p-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {j.gone ? <span className="font-medium text-ink-400 line-through">{j.title}</span> : <Link href={`/job/${j.jobModel === "Job" ? "internal" : "external"}/${j.jobId}`} className="font-medium text-navy hover:underline">{j.title}</Link>}
              <div className="jm-muted">{[j.company, j.city, j.remote ? "Remote" : ""].filter(Boolean).join(" · ")}{j.gone ? " · המשרה כבר לא פתוחה" : ""}</div>
            </div>
            {typeof j.matchScore === "number" && <span className="jm-chip jm-chip-teal">{j.matchScore}%</span>}
            <button onClick={() => unsave(j.jobId, j.jobModel)} className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9" aria-label="הסר משמורים" title="הסר"><X className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
