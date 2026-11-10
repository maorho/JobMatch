"use client";
import Link from "next/link";
import CompanyLogo from "@/app/components/CompanyLogo";
import { HUB_ROLES, isHubRole, roleLabel, citySlug, type HubData } from "@/app/lib/seo/hubsShared";
import { ROLE_INFO } from "@/app/lib/practice/roles";
import { useT } from "@/app/lib/i18n/LanguageProvider";

/** The shared layout of a role / city hub: headline with counts, the freshest postings, and links onward. */
export default function HubPage({ data, path, cities, current }: { data: HubData; path: string; cities: { city: string; n: number }[]; current: { role?: string; city?: string } }) {
  const { t, dir, lang } = useT();
  // Headline and intro follow the interface language (the server page keeps Hebrew for metadata and JSON-LD).
  const role = current.role && isHubRole(current.role) ? current.role : null;
  const remote = current.city === "remote";
  const title = role
    ? t("pages.hubs.roleTitle", { role: lang === "he" ? roleLabel(role) : ROLE_INFO[role].en })
    : remote ? t("pages.hubs.remoteTitle") : t("pages.hubs.cityTitle", { city: current.city || "" });
  const intro = role
    ? t("pages.hubs.roleIntro", { role: ROLE_INFO[role].en, stack: ROLE_INFO[role].stack })
    : remote ? t("pages.hubs.remoteIntro") : t("pages.hubs.cityIntro", { city: current.city || "" });
  return (
    <div className="jm-page" dir={dir}>
      <nav className="jm-muted text-sm mb-3" aria-label="breadcrumb">
        <Link href="/" className="hover:text-navy">{t("hubs.jobs")}</Link> <span aria-hidden="true">/</span> <span className="text-navy">{title}</span>
      </nav>
      <header className="mb-6">
        <h1 className="jm-title">{title}</h1>
        <p className="mt-2 text-ink-600 leading-relaxed max-w-2xl">{intro}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="jm-chip jm-chip-teal">{t("hubs.open", { n: data.total.toLocaleString() })}</span>
          <span className="jm-chip">{t("hubs.companies", { n: data.companies.toLocaleString() })}</span>
          {data.juniorCount > 0 && <Link href={`${path}${path.includes("?") ? "&" : "?"}exp=0-2`} className="jm-chip jm-chip-sky hover:bg-sky/20">{t("hubs.junior", { n: data.juniorCount.toLocaleString() })}</Link>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
        <section aria-label={t("hubs.jobs")}>
          {data.jobs.length === 0 ? (
            <div className="jm-card p-6 jm-muted">{t("hubs.none")}</div>
          ) : (
            <ul className="space-y-2">
              {data.jobs.map((j) => (
                <li key={j._id}>
                  <Link href={`/job/external/${j._id}`} className="jm-card jm-card-hover p-4 flex items-center gap-4">
                    <CompanyLogo name={j.company} domain={j.companyDomain} logoUrl={j.logoUrl} className="h-10 w-10 shrink-0 rounded-xl border border-line p-1" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-navy truncate" dir="auto">{j.job}</div>
                      <div className="text-sm text-ink-600 truncate">
                        {j.company}
                        {j.city && j.city !== "Unknown" ? ` · ${j.city}` : ""}
                        {j.remote ? " · Remote" : ""}
                        {j.experienceMin != null ? ` · ${t("hubs.years", { n: j.experienceMin })}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-ink-400 shrink-0">{j.ageDays == null ? "" : j.ageDays === 0 ? t("pages.hubs.today") : j.ageDays === 1 ? t("pages.hubs.yesterday") : t("pages.hubs.daysAgo", { n: j.ageDays })}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.total > data.jobs.length && (
            <p className="mt-4 text-sm jm-muted">
              {t("hubs.showing", { shown: data.jobs.length, total: data.total.toLocaleString() })} <Link href={path} className="text-sky-600 underline underline-offset-2">{t("hubs.allWithFilters")}</Link>
            </p>
          )}
        </section>

        <aside className="space-y-6">
          {data.tech.length > 0 && (
            <section className="jm-card p-5">
              <h2 className="font-semibold text-navy mb-3">{t("hubs.tech")}</h2>
              <div className="flex flex-wrap gap-2" dir="ltr">
                {data.tech.map((t) => (
                  <Link key={t.tech} href={`/?tech=${encodeURIComponent(t.tech)}`} className="jm-chip hover:bg-canvas">
                    {t.tech} <span className="text-ink-400">{t.n}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="jm-card p-5">
            <h2 className="font-semibold text-navy mb-3">{t("hubs.byRole")}</h2>
            <ul className="space-y-1 text-sm">
              {HUB_ROLES.map((r) => (
                <li key={r}>
                  <Link href={`/jobs/role/${r}`} className={`hover:text-navy ${current.role === r ? "text-navy font-semibold" : "text-ink-600"}`}>{t("hubs.roleJobs", { role: roleLabel(r) })}</Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="jm-card p-5">
            <h2 className="font-semibold text-navy mb-3">{t("hubs.byPlace")}</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/jobs/in/remote" className={`hover:text-navy ${current.city === "remote" ? "text-navy font-semibold" : "text-ink-600"}`}>{t("hubs.remote")}</Link></li>
              {cities.map((c) => (
                <li key={c.city}>
                  <Link href={`/jobs/in/${citySlug(c.city)}`} className={`hover:text-navy ${current.city?.toLowerCase() === c.city.toLowerCase() ? "text-navy font-semibold" : "text-ink-600"}`}>
                    {t("hubs.inCity", { city: c.city })} <span className="text-ink-400">{c.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
