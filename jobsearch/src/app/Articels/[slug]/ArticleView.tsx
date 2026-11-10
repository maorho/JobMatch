"use client";
import Link from "next/link";
import { useT } from "../../lib/i18n/LanguageProvider";

export type ArticleSection = { heading?: string; paragraphs?: string[]; bullets?: string[] };
export type ArticleViewData = {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  date: string;
  readMinutes: number;
  source: "agent" | "manual" | "static";
  sections: ArticleSection[];
};

/**
 * One article. The body (title, sections) is data and renders as written;
 * the chrome around it (back link, byline, CTA, "more") follows the interface language.
 */
export default function ArticleView({ article: a, others }: { article: ArticleViewData; others: { slug: string; title: string }[] }) {
  const { t, lang, dir } = useT();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  return (
    <div className="jm-page" dir={dir}>
      <article className="max-w-3xl mx-auto">
        <Link href="/Articels" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">{t("pages.articles.all")}</Link>
        <header className="mt-4 mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {a.tags.map((tag) => (
              <span key={tag} className="jm-chip jm-chip-sky">{tag}</span>
            ))}
          </div>
          <h1 className="jm-title" dir="auto">{a.title}</h1>
          <p className="text-base sm:text-lg text-ink-600 mt-3 leading-relaxed" dir="auto">{a.excerpt}</p>
          <div className="jm-muted mt-3">
            {new Date(a.date).toLocaleDateString(locale)} · {t("pages.articles.readMinutes", { n: a.readMinutes })}{a.source === "agent" ? t("pages.articles.byAgent") : ""}
          </div>
        </header>

        <div className="jm-card p-6 sm:p-10 space-y-6 text-base sm:text-[17px] [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-600 [&_ul]:leading-relaxed" dir="auto">
          {a.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2>{s.heading}</h2>}
              {s.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="jm-hero mt-8 p-6 sm:p-8">
          <h3 className="text-xl font-semibold">{t("pages.articles.ctaTitle")}</h3>
          <p className="text-white/80 mt-1 leading-relaxed">{t("pages.articles.ctaText")}</p>
          <Link href="/ResumeAI" className="jm-btn jm-btn-accent mt-4">{t("pages.articles.ctaBtn")}</Link>
        </div>

        {others.length > 0 && (
          <div className="mt-8">
            <h3 className="jm-h2 mb-3">{t("pages.articles.more")}</h3>
            <ul className="space-y-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/Articels/${o.slug}`} className="jm-card jm-card-hover block px-5 py-3 text-navy font-medium hover:text-teal" dir="auto">{o.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
