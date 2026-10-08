import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLES, getArticle } from "../../content/articles";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  return a ? { title: `${a.title} | JobMatch`, description: a.excerpt } : { title: "מאמר | JobMatch" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const others = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3);

  return (
    <article className="max-w-3xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <Link href="/Articels" className="text-sm text-[#11AEFF] hover:underline">← כל המאמרים</Link>
      <h1 className="text-3xl lg:text-[40px] font-semibold text-[#232323] leading-tight mt-3">{a.title}</h1>
      <p className="text-lg text-[#232323]/70 mt-3 leading-relaxed">{a.excerpt}</p>
      <div className="text-xs text-[#232323]/50 mt-3 mb-8">{new Date(a.date).toLocaleDateString("he-IL")} · {a.readMinutes} דק&apos; קריאה · {a.tags.join(" · ")}</div>

      <div className="space-y-6 text-[17px] leading-relaxed text-[#232323]/85">
        {a.sections.map((s, i) => (
          <section key={i}>
            {s.heading && <h2 className="text-xl font-semibold text-[#232323] mb-2">{s.heading}</h2>}
            {s.paragraphs?.map((p, j) => <p key={j} className="mb-3">{p}</p>)}
            {s.bullets && (
              <ul className="list-disc pe-6 space-y-2 marker:text-[#24A8A2]">
                {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-[24px] bg-[#102B39] text-white p-6">
        <h3 className="text-xl font-semibold">מוכן/ה ליישם?</h3>
        <p className="text-white/80 mt-1">העלה/י קורות חיים ל-ResumeAI וקבל/י פיד מותאם, התאמה למשרה והכנה לראיון — בחינם.</p>
        <Link href="/ResumeAI" className="inline-block mt-4 bg-[#11AEFF] hover:bg-[#0d8ed6] text-white px-5 py-3 rounded-[14px] transition">להתחיל עם ResumeAI</Link>
      </div>

      {others.length > 0 && (
        <div className="mt-10">
          <h3 className="font-semibold text-[#232323] mb-3">עוד מאמרים</h3>
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.slug}><Link href={`/Articels/${o.slug}`} className="text-[#11AEFF] hover:underline">{o.title}</Link></li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
