"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Target, Mic, MessageSquareQuote, Code2, Zap, Users } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Stats = { jobs: number; companies: number; sources: number; newLast24h: number; lastPolledAt: string | null };

/**
 * The front door for visitors: what the catalogue is, how it works and where
 * to start. Loads no postings, only the cached catalogue numbers.
 */
export default function Landing() {
  const { t, lang, dir } = useT();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/catalog/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, []);
  const n = (v?: number) => (v ?? 0).toLocaleString();

  const features = [
    { icon: Target, title: t("pages.landing.f1t"), text: t("pages.landing.f1d"), href: "/jobs" },
    { icon: Mic, title: t("pages.landing.f2t"), text: t("pages.landing.f2d"), href: "/jobs" },
    { icon: MessageSquareQuote, title: t("pages.landing.f3t"), text: t("pages.landing.f3d"), href: "/interview-questions" },
    { icon: Code2, title: t("pages.landing.f4t"), text: t("pages.landing.f4d"), href: "/practice" },
    { icon: Zap, title: t("pages.landing.f5t"), text: t("pages.landing.f5d"), href: "/SignUp" },
    { icon: Users, title: t("pages.landing.f6t"), text: t("pages.landing.f6d"), href: "/referrals" },
  ];
  const quick: [string, string][] = [
    ["/jobs?posted=1", t("home.quick.newToday")],
    ["/jobs?exp=0-2", t("home.quick.years02")],
    ["/jobs?seniority=Junior", t("home.quick.junior")],
    ["/jobs?jobType=Remote", t("home.quick.remote")],
    ["/jobs?jobType=Hybrid", t("home.quick.hybrid")],
    ["/jobs?city=Tel%20Aviv", t("home.quick.telAviv")],
    ["/jobs?country=Israel", t("home.quick.israel")],
  ];
  const hubs: [string, string][] = [
    ["/jobs/role/backend", "Backend"], ["/jobs/role/frontend", "Frontend"], ["/jobs/role/fullstack", "Full Stack"], ["/jobs/role/data", "Data / ML"], ["/jobs/role/devops", "DevOps"], ["/jobs/role/qa", "QA"], ["/jobs/role/mobile", "Mobile"],
    ["/jobs/in/Tel%20Aviv", lang === "he" ? "תל אביב" : "Tel Aviv"], ["/jobs/in/Haifa", lang === "he" ? "חיפה" : "Haifa"], ["/jobs/in/Jerusalem", lang === "he" ? "ירושלים" : "Jerusalem"], ["/jobs/in/remote", t("home.quick.remote")],
  ];

  return (
    <div className="jm-container pt-6 sm:pt-10 pb-12" dir={dir}>
      {/* Hero */}
      <section className="relative jm-band overflow-hidden px-5 pt-10 pb-10 sm:px-10 sm:pt-16 lg:pt-20">
        <div className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-sky/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -start-16 h-80 w-80 rounded-full bg-teal/10 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto text-center animate-rise">
          <span className="jm-eyebrow">
            {stats && stats.jobs > 0
              ? t("home.eyebrowStats", { jobs: n(stats.jobs), companies: n(stats.companies), updated: t("home.updatedEvery") })
              : t("home.eyebrowEmpty")}
          </span>
          <h1 className="jm-display mt-4 text-[38px] sm:text-5xl lg:text-[64px] text-navy leading-[1.04]">
            {t("home.headline1")} <span className="italic text-teal">{t("home.headline2")}</span>{t("home.headline3") ? ` ${t("home.headline3")}` : ""}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-ink-600 max-w-2xl mx-auto leading-relaxed">
            {t("home.sub", { companies: stats ? n(stats.companies) : t("home.companiesFallback") })}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : "/jobs");
            }}
            className="mt-7 sm:mt-9 bg-surface rounded-[22px] lg:rounded-full p-1.5 flex flex-col lg:flex-row gap-1.5 text-ink shadow-card-hover border border-line text-start"
          >
            <label className="relative flex-1">
              <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400 pointer-events-none" />
              <input
                className="w-full h-12 lg:h-14 ps-12 pe-4 rounded-full bg-transparent text-base placeholder:text-ink-400 focus:outline-none focus:bg-canvas"
                type="search"
                placeholder={t("pages.landing.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t("home.searchAria")}
              />
            </label>
            <button type="submit" className="jm-btn jm-btn-primary h-12 lg:h-14 lg:px-7">
              {t("home.searchBtn")} <ArrowRight className={`h-4 w-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
            </button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {quick.map(([href, label]) => (
              <Link key={href} href={href} className="jm-chip bg-surface hover:bg-band-200 transition-colors">{label}</Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/SignUp" className="jm-btn jm-btn-accent h-12 px-6">{t("pages.landing.ctaSignUp")}</Link>
            <Link href="/jobs" className="jm-btn jm-btn-secondary h-12 px-6">{t("pages.landing.ctaBrowse")}</Link>
          </div>
          <p className="mt-3 text-sm text-ink-600">
            <Link href="/Login" className="underline underline-offset-2 hover:text-navy">{t("pages.landing.ctaSignIn")}</Link>
          </p>
        </div>

        {stats && stats.jobs > 0 && (
          <dl className="relative mt-10 grid grid-cols-3 gap-3 max-w-2xl mx-auto text-center">
            {[
              [n(stats.jobs), t("pages.landing.statJobs")],
              [n(stats.companies), t("pages.landing.statCompanies")],
              [n(stats.newLast24h), t("pages.landing.statNew")],
            ].map(([v, l]) => (
              <div key={l} className="jm-card px-3 py-4">
                <dd className="text-2xl sm:text-3xl font-semibold text-navy leading-none tabular-nums">{v}</dd>
                <dt className="mt-1.5 text-xs sm:text-sm text-ink-600">{l}</dt>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* How it works */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label={t("home.howAria")}>
        {[
          { n: "1", t: t("home.step1.t"), d: t("home.step1.d", { sources: stats ? n(stats.sources) : t("home.companiesFallback") }) },
          { n: "2", t: t("home.step2.t"), d: t("home.step2.d") },
          { n: "3", t: t("home.step3.t"), d: t("home.step3.d") },
        ].map((s) => (
          <div key={s.n} className="jm-card p-5">
            <div className="h-8 w-8 rounded-full bg-teal-50 text-teal font-semibold flex items-center justify-center">{s.n}</div>
            <h2 className="mt-3 font-semibold text-navy">{s.t}</h2>
            <p className="mt-1 text-sm text-ink-600 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="mt-12">
        <h2 className="jm-title text-center">{t("pages.landing.featuresTitle")}</h2>
        <p className="jm-subtitle text-center max-w-2xl mx-auto">{t("pages.landing.featuresSub")}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link key={f.title} href={f.href} className="jm-card jm-card-hover p-5 flex gap-4">
              <span className="h-11 w-11 shrink-0 rounded-xl bg-sky-50 text-sky flex items-center justify-center"><f.icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-navy">{f.title}</span>
                <span className="block mt-1 text-sm text-ink-600 leading-relaxed">{f.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Hubs */}
      <section className="mt-12 jm-card p-5 sm:p-6" aria-label={t("pages.landing.hubsTitle")}>
        <h2 className="font-semibold text-navy mb-3">{t("pages.landing.hubsTitle")}</h2>
        <nav className="flex flex-wrap gap-2 text-sm">
          {hubs.map(([href, label]) => (
            <Link key={href} href={href} className="jm-chip hover:bg-canvas">{label}</Link>
          ))}
        </nav>
      </section>

      {/* Final CTA */}
      <section className="mt-12 jm-hero p-8 sm:p-12 text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold leading-tight">{t("pages.landing.finalTitle")}</h2>
        <p className="mt-2 text-white/80 max-w-xl mx-auto leading-relaxed">{t("pages.landing.finalSub")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/SignUp" className="jm-btn jm-btn-accent h-12 px-6">{t("pages.landing.ctaSignUp")}</Link>
          <Link href="/jobs" className="jm-btn jm-btn-ghost text-white h-12 px-6">{t("pages.landing.ctaBrowse")}</Link>
        </div>
        <p className="mt-5 text-sm text-white/70">
          {t("pages.landing.freeNote")}{" "}
          <Link href="/PrivacyPolicy" className="underline underline-offset-2">{t("home.privacyLink")}</Link>
        </p>
      </section>
    </div>
  );
}
