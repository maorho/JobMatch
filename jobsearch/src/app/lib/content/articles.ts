import { connectToDatabase } from "@/app/lib/db";
import Article from "@/app/models/Article";
import { ARTICLES, type Article as StaticArticle } from "@/app/content/articles";

/** What the public pages render: DB articles (published) merged with the static seed. */
export type PublicArticle = StaticArticle & { seo?: { title?: string; description?: string; keywords?: string[] }; source: "agent" | "manual" | "static" };

const sectionsOf = (list: any[]) => (list || []).map((s: any) => ({ heading: s.heading || undefined, paragraphs: s.paragraphs?.length ? s.paragraphs : undefined, bullets: s.bullets?.length ? s.bullets : undefined }));
const referencesOf = (list: any[]) => (list || []).filter((r: any) => r?.url).map((r: any) => ({ title: r.title || r.url, url: r.url, note: r.note || undefined }));

const fromDb = (a: any): PublicArticle => ({
  slug: a.slug,
  title: a.title,
  excerpt: a.excerpt,
  date: (a.publishedAt || a.createdAt || new Date()).toISOString(),
  readMinutes: a.readMinutes || 5,
  tags: a.tags || [],
  sections: sectionsOf(a.sections),
  references: referencesOf(a.references),
  en: a.en?.title ? { title: a.en.title, excerpt: a.en.excerpt || "", tags: a.en.tags || [], sections: sectionsOf(a.en.sections), references: referencesOf(a.en.references) } : undefined,
  seo: a.seo,
  source: a.source || "agent",
});

export async function listArticles(): Promise<PublicArticle[]> {
  let db: any[] = [];
  try {
    await connectToDatabase();
    db = await Article.find({ status: "published" }).sort({ publishedAt: -1 }).limit(200).lean();
  } catch (e) {
    console.warn("[articles] DB unavailable, serving the static seed only:", (e as Error)?.message);
  }
  const seen = new Set<string>();
  const out: PublicArticle[] = [];
  for (const a of [...db.map(fromDb), ...ARTICLES.map((a) => ({ ...a, source: "static" as const }))]) {
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    out.push(a);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getArticleBySlug(slug: string, opts: { includeDrafts?: boolean } = {}): Promise<PublicArticle | null> {
  try {
    await connectToDatabase();
    const a: any = await Article.findOne({ slug, ...(opts.includeDrafts ? {} : { status: "published" }) }).lean();
    if (a) return fromDb(a);
  } catch (e) {
    console.warn("[articles] DB unavailable:", (e as Error)?.message);
  }
  const s = ARTICLES.find((x) => x.slug === slug);
  return s ? { ...s, source: "static" } : null;
}
