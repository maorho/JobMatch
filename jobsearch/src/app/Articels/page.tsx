import Link from "next/link";
import { ARTICLES } from "../content/articles";

export const metadata = { title: "מאמרים | JobMatch", description: "מדריכים פרקטיים לחיפוש עבודה בהייטק הישראלי — קורות חיים, ראיונות, AI." };

export default function ArticlesPage() {
  const articles = [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323]">מאמרים ומדריכים</h1>
      <p className="text-[#232323]/60 mt-1 mb-8">פרקטי, ספציפי לשוק הישראלי, בלי קלישאות.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {articles.map((a) => (
          <Link key={a.slug} href={`/Articels/${a.slug}`} className="rounded-[24px] border border-[#232323]/10 bg-white p-6 flex flex-col gap-3 hover:shadow-md transition">
            <div className="flex flex-wrap gap-2">
              {a.tags.map((t) => <span key={t} className="rounded-full bg-[#F9F9F9] border border-[#232323]/10 px-3 py-1 text-xs text-[#232323]/70">{t}</span>)}
            </div>
            <h2 className="text-xl font-semibold text-[#232323] leading-snug">{a.title}</h2>
            <p className="text-sm text-[#232323]/70 leading-relaxed">{a.excerpt}</p>
            <div className="mt-auto text-xs text-[#232323]/50 pt-2">{new Date(a.date).toLocaleDateString("he-IL")} · {a.readMinutes} דק&apos; קריאה</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
