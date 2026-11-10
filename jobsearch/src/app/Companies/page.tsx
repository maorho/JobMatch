"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import CompanyLogo from "../components/CompanyLogo";
import { PageHeader, Spinner, EmptyState } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";

type CompanyRow = {
  name: string;
  jobs: number;
  junior: number;
  remote: number;
  cities: string[];
  domain: string;
  logoUrl: string;
  careersUrl: string;
  summary?: string;
  industry?: string;
  hq?: string;
  size?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export default function CompaniesPage() {
  const { t, dir } = useT();
  const { data, isLoading } = useSWR("/api/companies", fetcher);
  const [q, setQ] = useState("");
  const [juniorOnly, setJuniorOnly] = useState(false);
  const rows: CompanyRow[] = data?.companies ?? [];

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((c) => (!term || c.name.toLowerCase().includes(term) || (c.industry || "").toLowerCase().includes(term) || (c.summary || "").toLowerCase().includes(term)) && (!juniorOnly || c.junior > 0));
  }, [rows, q, juniorOnly]);

  const totalJobs = rows.reduce((s, c) => s + c.jobs, 0);

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader
        title={t("pages.companies.title")}
        subtitle={isLoading ? t("common.loading") : t("pages.companies.subtitle", { companies: rows.length, jobs: totalJobs.toLocaleString() })}
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("pages.companies.search")}
              className="jm-input sm:w-64"
            />
            <label className="flex items-center gap-2 text-sm text-ink-600 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={juniorOnly} onChange={(e) => setJuniorOnly(e.target.checked)} className="accent-teal h-4 w-4" />
              {t("pages.companies.juniorOnly")}
            </label>
          </div>
        }
      />

      {isLoading && <Spinner label={t("common.loading")} />}

      {!isLoading && shown.length === 0 && (
        <EmptyState icon="🏢" title={t("pages.companies.none")} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {shown.map((c) => (
          <div key={c.name} className="jm-card jm-card-hover jm-reveal p-5 flex flex-col gap-4 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <CompanyLogo name={c.name} domain={c.domain} logoUrl={c.logoUrl} className="w-12 h-12 shrink-0 border border-line p-1" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className="font-semibold text-navy truncate" dir="auto">{c.name}</h2>
                <p className="jm-muted truncate">{[c.industry, ...(c.cities.length ? [c.cities.join(" · ")] : [])].filter(Boolean).join(" · ") || " "}</p>
              </div>
            </div>
            {c.summary ? (
              <p className="text-sm text-ink-600 leading-relaxed line-clamp-3" dir="auto" title={c.summary}>{c.summary}</p>
            ) : (
              <p className="text-sm text-ink-400 leading-relaxed">{t("pages.companies.summarySoon")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <span className="jm-chip">{t("pages.companies.jobs", { n: c.jobs })}</span>
              {c.size && <span className="jm-chip">{c.size}</span>}
              {c.junior > 0 && <span className="jm-chip jm-chip-teal">{t("pages.companies.junior", { n: c.junior })}</span>}
              {c.remote > 0 && <span className="jm-chip jm-chip-sky">{t("pages.companies.remote", { n: c.remote })}</span>}
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <Link href={`/?company=${encodeURIComponent(c.name)}`} className="jm-btn jm-btn-secondary jm-btn-sm">
                {t("pages.companies.viewJobs")}
              </Link>
              {c.careersUrl && (
                <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-600 hover:text-teal transition-colors">
                  {t("pages.companies.careers")}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
