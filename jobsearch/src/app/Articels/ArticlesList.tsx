"use client";
import Link from "next/link";
import { PageHeader } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";

/** Plain-JSON summary of an article, as listed by the server page. */
export type ArticleSummary = { slug: string; title: string; excerpt: string; tags: string[]; date: string; readMinutes: number; en?: { title: string; excerpt: string; tags: string[] } };

/** The articles index in the interface language (an article without an English version is listed in Hebrew). */
export default function ArticlesList({ articles }: { articles: ArticleSummary[] }) {
  const { t, lang, dir } = useT();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  return (
    <div className="jm-page" dir={dir}>
      <PageHeader title={t("pages.articles.title")} subtitle={t("pages.articles.subtitle")} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {articles.map((a) => {
          const text = lang === "en" && a.en ? a.en : a;
          const cardDir = lang === "en" && a.en ? "ltr" : "rtl";
          return (
            <Link key={a.slug} href={`/Articels/${a.slug}`} className="jm-card jm-card-hover p-5 sm:p-6 flex flex-col gap-3" dir={cardDir}>
              <div className="flex flex-wrap gap-2">
                {text.tags.map((tag) => (
                  <span key={tag} className="jm-chip jm-chip-sky">{tag}</span>
                ))}
              </div>
              <h2 className="jm-h2 leading-snug">{text.title}</h2>
              <p className="text-sm text-ink-600 leading-relaxed">{text.excerpt}</p>
              <div className="mt-auto jm-muted pt-2">
                {new Date(a.date).toLocaleDateString(locale)} · {t("pages.articles.readMinutes", { n: a.readMinutes })}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
