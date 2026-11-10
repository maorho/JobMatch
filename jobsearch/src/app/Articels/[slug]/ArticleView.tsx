"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "../../lib/i18n/LanguageProvider";

export type ArticleSection = { heading?: string; paragraphs?: string[]; bullets?: string[] };
export type ArticleReference = { title: string; url: string; note?: string };
export type ArticleText = { title: string; excerpt: string; tags: string[]; sections: ArticleSection[]; references?: ArticleReference[] };
export type ArticleViewData = ArticleText & {
  slug: string;
  date: string;
  readMinutes: number;
  source: "agent" | "manual" | "static";
  /** The English version; the top-level text is Hebrew. */
  en?: ArticleText;
};

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)/g;

/** Paragraph text with Markdown links: [text](https://…) or [text](/path). Nothing else is interpreted. */
export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(LINK_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const [, label, href] = m;
    const internal = href.startsWith("/");
    out.push(
      internal ? (
        <Link key={i++} href={href} className="text-sky-600 underline underline-offset-2 hover:text-navy">{label}</Link>
      ) : (
        <a key={i++} href={href} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline underline-offset-2 hover:text-navy">{label}</a>
      )
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * One article in the interface language (English when it has an English
 * version, Hebrew otherwise), with its sources at the end.
 */
export default function ArticleView({ article: a, others }: { article: ArticleViewData; others: { slug: string; title: string; titleEn?: string }[] }) {
  const { t, lang, dir } = useT();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const text: ArticleText = lang === "en" && a.en ? a.en : a;
  const textDir = lang === "en" && a.en ? "ltr" : "rtl";
  return (
    <div className="jm-page" dir={dir}>
      <article className="max-w-3xl mx-auto">
        <Link href="/Articels" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">{t("pages.articles.all")}</Link>
        <header className="mt-4 mb-8" dir={textDir}>
          <div className="flex flex-wrap gap-2 mb-4">
            {text.tags.map((tag) => (
              <span key={tag} className="jm-chip jm-chip-sky">{tag}</span>
            ))}
          </div>
          <h1 className="jm-title">{text.title}</h1>
          <p className="text-base sm:text-lg text-ink-600 mt-3 leading-relaxed">{text.excerpt}</p>
          <div className="jm-muted mt-3">
            {new Date(a.date).toLocaleDateString(locale)} · {t("pages.articles.readMinutes", { n: a.readMinutes })}{a.source === "agent" ? t("pages.articles.byAgent") : ""}
          </div>
        </header>

        <div className="jm-card p-6 sm:p-10 space-y-6 text-base sm:text-[17px] [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-600 [&_ul]:leading-relaxed" dir={textDir}>
          {text.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2>{s.heading}</h2>}
              {s.paragraphs?.map((p, j) => <p key={j}><RichText text={p} /></p>)}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b, j) => <li key={j}><RichText text={b} /></li>)}
                </ul>
              )}
            </section>
          ))}

          {text.references && text.references.length > 0 && (
            <section className="pt-6 border-t border-line">
              <h2 className="text-base">{t("pages.articles.references")}</h2>
              <ol className="list-decimal ps-5 space-y-1.5 text-sm text-ink-600">
                {text.references.map((r, i) => (
                  <li key={i}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline underline-offset-2 hover:text-navy">{r.title}</a>
                    {r.note ? <span> — {r.note}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          )}
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
                  <Link href={`/Articels/${o.slug}`} className="jm-card jm-card-hover block px-5 py-3 text-navy font-medium hover:text-teal" dir={lang === "en" && o.titleEn ? "ltr" : "rtl"}>{lang === "en" && o.titleEn ? o.titleEn : o.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
