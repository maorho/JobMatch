"use client";
import Link from "next/link";
import { LogoMark } from "./Logo";
import { Github, Linkedin } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

const COLUMNS: { title: Key; links: { href: string; key: Key }[] }[] = [
  {
    title: "footer.product",
    links: [
      { href: "/jobs", key: "nav.jobs" },
      { href: "/Companies", key: "nav.companies" },
      { href: "/ResumeAI", key: "nav.resumeAI" },
      { href: "/Articels", key: "nav.articles" },
    ],
  },
  {
    title: "footer.account",
    links: [
      { href: "/Dashboard", key: "nav.dashboard" },
      { href: "/Settings", key: "nav.settings" },
      { href: "/Login", key: "nav.signIn" },
      { href: "/SignUp", key: "nav.signUp" },
    ],
  },
  {
    title: "footer.company",
    links: [
      { href: "/About", key: "footer.about" },
      { href: "/ContactUs", key: "footer.contact" },
      { href: "/TermsOfConditions", key: "footer.terms" },
      { href: "/PrivacyPolicy", key: "footer.privacy" },
      { href: "/Accessibility", key: "footer.accessibility" },
    ],
  },
];

/** The public hub pages: the entrances search engines send people to. */
const HUB_ROLES: [string, string][] = [["backend", "Backend"], ["frontend", "Frontend"], ["fullstack", "Full Stack"], ["data", "Data / ML"], ["devops", "DevOps"], ["qa", "QA"], ["mobile", "Mobile"]];
const HUB_CITIES: [string, string, string][] = [["Tel%20Aviv", "תל אביב", "Tel Aviv"], ["Haifa", "חיפה", "Haifa"], ["Jerusalem", "ירושלים", "Jerusalem"]];

const SOCIAL = [
  { href: "https://www.linkedin.com/in/maor-homri-a78665229/", label: "LinkedIn", Icon: Linkedin },
  { href: "https://www.github.com/maorho/JobMatch", label: "GitHub", Icon: Github },
];

function Footer() {
  const year = new Date().getUTCFullYear();
  const { t, lang, dir } = useT();
  const hubs = [
    ...HUB_ROLES.map(([slug, name]) => ({ href: `/jobs/role/${slug}`, label: t("hubs.roleJobs", { role: name }) })),
    ...HUB_CITIES.map(([slug, he, en]) => ({ href: `/jobs/in/${slug}`, label: t("hubs.inCity", { city: lang === "he" ? he : en }) })),
    { href: "/jobs/in/remote", label: t("hubs.remote") },
  ];
  return (
    <footer className="mt-16 border-t border-line bg-surface" dir={dir}>
      <div className="jm-container py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <LogoMark size={36} className="text-black" />
            <span className="text-lg font-semibold text-navy">JobMatch</span>
          </Link>
          <p className="text-sm text-ink-600 max-w-xs leading-relaxed">{t("footer.tagline")}</p>
          <div className="flex gap-2">
            {SOCIAL.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="h-10 w-10 rounded-xl border border-line text-navy flex items-center justify-center hover:bg-navy hover:text-white transition-colors"
              >
                <Icon className="h-4.5 w-4.5" />
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-navy mb-3">{t(c.title)}</h3>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-600 hover:text-sky transition-colors">
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <nav className="jm-container py-5 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={t("footer.hubsAria")}>
          {hubs.map((h) => (
            <Link key={h.href} href={h.href} className="text-ink-600 hover:text-sky transition-colors">
              {h.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="jm-container py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-ink-400">
          <span>{t("footer.rights", { year })}</span>
          <span>{t("footer.built")}</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
