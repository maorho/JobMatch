import type { Metadata } from "next";
import Link from "next/link";
import { listArticles } from "../lib/content/articles";
import { PageHeader } from "../components/ui";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "מאמרים ומדריכים לחיפוש עבודה בהייטק",
  description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי — קורות חיים שעוברים ATS, ראיונות, משרות ג'וניור, AI. מבוסס על נתוני הקטלוג של JobMatch.",
  alternates: { canonical: "/Articels" },
  openGraph: { title: "מאמרים ומדריכים · JobMatch", description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי.", url: "/Articels" },
};

export default async function ArticlesPage() {
  const articles = await listArticles();
  return (
    <div className="jm-page" dir="rtl">
      <PageHeader title="מאמרים ומדריכים" subtitle="פרקטי, ספציפי לשוק הישראלי, מבוסס על נתוני הקטלוג — בלי קלישאות." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {articles.map((a) => (
          <Link key={a.slug} href={`/Articels/${a.slug}`} className="jm-card jm-card-hover p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {a.tags.map((t) => (
                <span key={t} className="jm-chip jm-chip-sky">{t}</span>
              ))}
            </div>
            <h2 className="jm-h2 leading-snug">{a.title}</h2>
            <p className="text-sm text-ink-600 leading-relaxed">{a.excerpt}</p>
            <div className="mt-auto jm-muted pt-2">
              {new Date(a.date).toLocaleDateString("he-IL")} · {a.readMinutes} דק&apos; קריאה
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
