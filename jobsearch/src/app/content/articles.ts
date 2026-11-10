/**
 * Editorial content for /Articels. Plain structured data (no CMS yet): one
 * file per article under ./articles/, each with a Hebrew and an English
 * version. Keep articles practical and specific to junior tech job seekers in
 * Israel — the product's first audience.
 *
 * Paragraphs and bullets may contain Markdown links: [text](https://…) or
 * [text](/practice). Nothing else is interpreted.
 */
export type ArticleSection = { heading?: string; paragraphs?: string[]; bullets?: string[] };
export type ArticleReference = { title: string; url: string; note?: string };
/** One language's text. */
export type ArticleText = { title: string; excerpt: string; tags: string[]; sections: ArticleSection[]; references?: ArticleReference[] };
export type Article = ArticleText & {
  slug: string;
  date: string; // ISO
  readMinutes: number;
  /** The English version; Hebrew is the top-level text. */
  en?: ArticleText;
};

import juniorResume from "./articles/junior-resume-that-passes-ats";
import whereJuniorJobs from "./articles/where-junior-jobs-really-are-in-israel";
import firstInterview from "./articles/first-technical-interview";
import aiInJobSearch from "./articles/use-ai-in-job-search-without-getting-caught-out";

export const ARTICLES: Article[] = [juniorResume, whereJuniorJobs, firstInterview, aiInJobSearch];

export const getArticle = (slug: string) => ARTICLES.find((a) => a.slug === slug) || null;
