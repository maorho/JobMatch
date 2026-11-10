import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listArticles, getArticleBySlug } from "../../lib/content/articles";
import { articleJsonLd, breadcrumbJsonLd } from "../../lib/seo/jsonld";
import ArticleView from "./ArticleView";

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
    // Per-page openGraph replaces the root one, so the image must be repeated here.
    openGraph: { title, description, type: "article", publishedTime: a.date, url: `/Articels/${a.slug}`, tags: a.tags, images: [{ url: "/og.png", width: 1200, height: 630, alt: "JobMatch" }] },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) notFound();
  const others = (await listArticles()).filter((x) => x.slug !== a.slug).slice(0, 3).map((o) => ({ slug: o.slug, title: o.title }));
  const jsonLd = [articleJsonLd(a), breadcrumbJsonLd([{ name: "מאמרים", path: "/Articels" }, { name: a.title, path: `/Articels/${a.slug}` }])];
  const article = {
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    tags: a.tags,
    date: a.date,
    readMinutes: a.readMinutes,
    source: a.source,
    sections: a.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs, bullets: s.bullets })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ArticleView article={article} others={others} />
    </>
  );
}
