import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/app/lib/authGuard";
import { connectToDatabase } from "@/app/lib/db";
import Article from "@/app/models/Article";
import { startFlow, processQueue } from "@/app/lib/agents";
import { ARTICLES } from "@/app/content/articles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Admin: every article (drafts included) + the static seed, newest first. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectToDatabase();
  const db: any[] = await Article.find({}).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({
    ok: true,
    articles: [
      ...db.map((a) => ({ _id: String(a._id), slug: a.slug, title: a.title, excerpt: a.excerpt, tags: a.tags, readMinutes: a.readMinutes, status: a.status, source: a.source, topic: a.topic, seo: a.seo, sections: a.sections, createdAt: a.createdAt, publishedAt: a.publishedAt || null })),
      ...ARTICLES.map((a) => ({ _id: `static:${a.slug}`, slug: a.slug, title: a.title, excerpt: a.excerpt, tags: a.tags, readMinutes: a.readMinutes, status: "published", source: "static", topic: "", seo: null, sections: a.sections, createdAt: a.date, publishedAt: a.date })),
    ],
  });
}

/**
 * Admin: POST { topic?, angle?, publish? } → ask the Writer for one article
 * (a given topic, or its own pick), and work the bus for up to ~90s so the
 * draft usually exists by the time this returns.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const topic = String(body?.topic || "").trim().slice(0, 200);
  const publish = !!body?.publish;
  const { runId } = topic
    ? await startFlow("content.request", { topic, angle: String(body?.angle || "").slice(0, 300) || undefined, publish }, { from: "admin", startedBy: `admin:${admin.id}`, title: `Article: ${topic}`, says: `Writer — please write about "${topic}".` })
    : await startFlow("content.plan", { count: 1, publish }, { from: "admin", startedBy: `admin:${admin.id}`, title: "Article (writer's pick)", says: "Writer — one new article, your pick of topic." });
  const result = await processQueue({ runId, budgetMs: 90_000, max: 10 });
  const written: any = await Article.findOne({ runId }).select("slug title status").lean();
  return NextResponse.json({ ok: true, runId, ...result, article: written ? { slug: written.slug, title: written.title, status: written.status } : null });
}

/** Admin: PATCH { id, status } → publish / unpublish / archive. */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "");
  const status = body?.status;
  if (!mongoose.Types.ObjectId.isValid(id) || !["draft", "published", "archived"].includes(status)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await connectToDatabase();
  const a: any = await Article.findByIdAndUpdate(id, { $set: { status, ...(status === "published" ? { publishedAt: new Date() } : {}) } }, { new: true }).lean();
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, article: { _id: String(a._id), slug: a.slug, status: a.status, publishedAt: a.publishedAt || null } });
}

/** Admin: DELETE ?id= → remove a generated article. */
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await connectToDatabase();
  const r = await Article.deleteOne({ _id: id });
  return NextResponse.json({ ok: true, deleted: r.deletedCount ?? 0 });
}
