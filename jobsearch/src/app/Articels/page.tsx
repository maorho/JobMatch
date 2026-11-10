import type { Metadata } from "next";
import { listArticles } from "../lib/content/articles";
import ArticlesList from "./ArticlesList";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "מאמרים ומדריכים לחיפוש עבודה בהייטק",
  description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי — קורות חיים שעוברים ATS, ראיונות, משרות ג'וניור, AI. מבוסס על נתוני הקטלוג של JobMatch.",
  alternates: { canonical: "/Articels" },
  openGraph: { title: "מאמרים ומדריכים · JobMatch", description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי.", url: "/Articels" },
};

export default async function ArticlesPage() {
  const articles = await listArticles();
  // Only what the list shows crosses to the client (the bodies stay on the server).
  const summaries = articles.map(({ slug, title, excerpt, tags, date, readMinutes, en }) => ({ slug, title, excerpt, tags, date, readMinutes, en: en ? { title: en.title, excerpt: en.excerpt, tags: en.tags } : undefined }));
  return <ArticlesList articles={summaries} />;
}
