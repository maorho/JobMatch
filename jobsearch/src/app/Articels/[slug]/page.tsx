import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listArticles, getArticleBySlug } from "../../lib/content/articles";
import { articleJsonLd, breadcrumbJsonLd } from "../../lib/seo/jsonld";

export const revalidate = 120;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) return { title: "מאמר לא נמצא", robots: { index: false } };
  const title = a.seo?.title || a.title;
  const description = a.seo?.description || a.excerpt;
  return {
    title,
    description,
    keywords: a.seo?.keywords?.length ? a.seo.keywords : a.tags,
    alternates: { canonical: `/Articels/${a.slug}` },
    openGraph: { title, description, type: "article", publishedTime: a.date, url: `/Articels/${a.slug}`, tags: a.tags },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) notFound();
  const others = (await listArticles()).filter((x) => x.slug !== a.slug).slice(0, 3);
  const jsonLd = [articleJsonLd(a), breadcrumbJsonLd([{ name: "מאמרים", path: "/Articels" }, { name: a.title, path: `/Articels/${a.slug}` }])];

  return (
    <div className="jm-page" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-3xl mx-auto">
        <Link href="/Articels" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">← כל המאמרים</Link>
        <header className="mt-4 mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {a.tags.map((t) => (
              <span key={t} className="jm-chip jm-chip-sky">{t}</span>
            ))}
          </div>
          <h1 className="jm-title">{a.title}</h1>
          <p className="text-base sm:text-lg text-ink-600 mt-3 leading-relaxed">{a.excerpt}</p>
          <div className="jm-muted mt-3">
            {new Date(a.date).toLocaleDateString("he-IL")} · {a.readMinutes} דק&apos; קריאה{a.source === "agent" ? " · נכתב על ידי סוכן ה-Writer של JobMatch ואושר על ידי העורך" : ""}
          </div>
        </header>

        <div className="jm-card p-6 sm:p-10 space-y-6 text-base sm:text-[17px] [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-600 [&_ul]:leading-relaxed">
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
          <h3 className="text-xl font-semibold">מוכן/ה ליישם?</h3>
          <p className="text-white/80 mt-1 leading-relaxed">העלה/י קורות חיים ל-ResumeAI וקבל/י פיד מותאם, התאמה למשרה והכנה לראיון — בחינם.</p>
          <Link href="/ResumeAI" className="jm-btn jm-btn-accent mt-4">להתחיל עם ResumeAI</Link>
        </div>

        {others.length > 0 && (
          <div className="mt-8">
            <h3 className="jm-h2 mb-3">עוד מאמרים</h3>
            <ul className="space-y-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/Articels/${o.slug}`} className="jm-card jm-card-hover block px-5 py-3 text-navy font-medium hover:text-teal">{o.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
