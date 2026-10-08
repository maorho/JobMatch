import Link from "next/link";
import { ARTICLES } from "../content/articles";
import { PageHeader } from "../components/ui";

export const metadata = { title: "מאמרים | JobMatch", description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי — קורות חיים, ראיונות, AI." };

export default function ArticlesPage() {
  const articles = [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="jm-page" dir="rtl">
      <PageHeader title="מאמרים ומדריכים" subtitle="פרקטי, ספציפי לשוק הישראלי, בלי קלישאות." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {articles.map((a) => (
          <Link key={a.slug} href={`/Articels/${a.slug}`} className="jm-card jm-card-hover p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {a.tags.map((t) => <span key={t} className="jm-chip jm-chip-sky">{t}</span>)}
            </div>
            <h2 className="jm-h2 leading-snug">{a.title}</h2>
            <p className="text-sm text-ink-600 leading-relaxed">{a.excerpt}</p>
            <div className="mt-auto jm-muted pt-2">{new Date(a.date).toLocaleDateString("he-IL")} · {a.readMinutes} דק&apos; קריאה</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
