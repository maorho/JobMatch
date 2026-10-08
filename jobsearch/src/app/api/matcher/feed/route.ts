import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { matchForUser } from "@/app/lib/matcher/matchCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personalized job feed for the signed-in user, ranked by match to their résumé.
 * ?page=&limit= . Returns { personalized, jobs, page, pages, total }.
 * `personalized: false` means we have no profile vector yet (caller should fall
 * back to the normal feed).
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const rawPage = parseInt(sp.get("page") || "1", 10);
  const rawLimit = parseInt(sp.get("limit") || "48", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 48;
  const skip = (page - 1) * limit;

  try {
    const matches = await matchForUser(userId, { limit, skip });

    if (matches.length === 0 && page === 1) {
      // No profile vector (or no embedded jobs) → let the client use the normal feed.
      return NextResponse.json({ personalized: false, jobs: [] });
    }

    await connectToDatabase();
    const total = await ExternalJobs.countDocuments({
      embedding: { $exists: true },
    });

    const jobs = matches.map((m) => ({
      ...m,
      id: m._id,
      source: "external" as const,
    }));

    return NextResponse.json({
      personalized: true,
      jobs,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (err: any) {
    console.error("❌ feed error:", err);
    return NextResponse.json(
      { personalized: false, jobs: [], error: err?.message || "feed failed" },
      { status: 500 }
    );
  }
}
