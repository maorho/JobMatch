import { connectToDatabase } from "@/app/lib/db";
import Article from "@/app/models/Article";
import { ARTICLES, type Article as StaticArticle } from "@/app/content/articles";

/** What the public pages render: DB articles (published) merged with the static seed. */
export type PublicArticle = StaticArticle & { seo?: { title?: string; description?: string; keywords?: string[] }; source: "agent" | "manual" | "static" };

const fromDb = (a: any): PublicArticle => ({
  slug: a.slug,
  title: a.title,
  excerpt: a.excerpt,
  date: (a.publishedAt || a.createdAt || new Date()).toISOString(),
  readMinutes: a.readMinutes || 5,
  tags: a.tags || [],
  sections: (a.sections || []).map((s: any) => ({ heading: s.heading || undefined, paragraphs: s.paragraphs?.length ? s.paragraphs : undefined, bullets: s.bullets?.length ? s.bullets : undefined })),
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
