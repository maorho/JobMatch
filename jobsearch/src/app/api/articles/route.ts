import { NextResponse } from "next/server";
import { listArticles } from "@/app/lib/content/articles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: the published articles (DB + seed), newest first. */
export async function GET() {
  const articles = await listArticles();
  return NextResponse.json({ ok: true, articles: articles.map(({ sections, ...a }) => ({ ...a, sections: sections.length })) });
}
