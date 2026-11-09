import Link from "next/link";
import CompanyLogo from "@/app/components/CompanyLogo";
import { HUB_ROLES, roleLabel, citySlug, type HubData } from "@/app/lib/seo/hubs";
import { absolute } from "@/app/lib/seo/site";

/** The shared layout of a role / city hub: headline with counts, the freshest postings, and links onward. */
export default function HubPage({ title, intro, data, path, cities, current }: { title: string; intro: string; data: HubData; path: string; cities: { city: string; n: number }[]; current: { role?: string; city?: string } }) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: data.jobs.length,
    itemListElement: data.jobs.slice(0, 30).map((j, i) => ({ "@type": "ListItem", position: i + 1, url: absolute(`/job/external/${j._id}`), name: `${j.job} – ${j.company}` })),
  };
  return (
    <div className="jm-page" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <nav className="jm-muted text-sm mb-3" aria-label="breadcrumb">
        <Link href="/" className="hover:text-navy">משרות</Link> <span aria-hidden="true">/</span> <span className="text-navy">{title}</span>
      </nav>
      <header className="mb-6">
        <h1 className="jm-title">{title}</h1>
        <p className="mt-2 text-ink-600 leading-relaxed max-w-2xl">{intro}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="jm-chip jm-chip-teal">{data.total.toLocaleString()} משרות פתוחות</span>
          <span className="jm-chip">{data.companies.toLocaleString()} חברות</span>
          {data.juniorCount > 0 && <Link href={`${path}?exp=0-2`} className="jm-chip jm-chip-sky hover:bg-sky/20">{data.juniorCount.toLocaleString()} עד 2 שנות ניסיון</Link>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
        <section aria-label="משרות">
          {data.jobs.length === 0 ? (
            <div className="jm-card p-6 jm-muted">אין כרגע משרות פתוחות כאן. המאגר מתעדכן כל חצי שעה.</div>
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
                        {j.experienceMin != null ? ` · ${j.experienceMin}+ שנות ניסיון` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-ink-400 shrink-0">{j.ageLabel}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.total > data.jobs.length && (
            <p className="mt-4 text-sm jm-muted">
              מוצגות {data.jobs.length} המשרות החדשות מתוך {data.total.toLocaleString()}. <Link href={path} className="text-sky-600 underline underline-offset-2">לכל המשרות עם סינון</Link>
            </p>
          )}
        </section>

        <aside className="space-y-6">
          {data.tech.length > 0 && (
            <section className="jm-card p-5">
              <h2 className="font-semibold text-navy mb-3">טכנולוגיות מבוקשות</h2>
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
            <h2 className="font-semibold text-navy mb-3">לפי תפקיד</h2>
            <ul className="space-y-1 text-sm">
              {HUB_ROLES.map((r) => (
                <li key={r}>
                  <Link href={`/jobs/role/${r}`} className={`hover:text-navy ${current.role === r ? "text-navy font-semibold" : "text-ink-600"}`}>משרות {roleLabel(r)}</Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="jm-card p-5">
            <h2 className="font-semibold text-navy mb-3">לפי מיקום</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/jobs/in/remote" className={`hover:text-navy ${current.city === "remote" ? "text-navy font-semibold" : "text-ink-600"}`}>משרות מרחוק</Link></li>
              {cities.map((c) => (
                <li key={c.city}>
                  <Link href={`/jobs/in/${citySlug(c.city)}`} className={`hover:text-navy ${current.city?.toLowerCase() === c.city.toLowerCase() ? "text-navy font-semibold" : "text-ink-600"}`}>
                    משרות ב{c.city} <span className="text-ink-400">{c.n}</span>
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
