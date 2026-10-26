import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import Notification from "@/app/models/Notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?limit=30&unread=1
 * The signed-in user's notifications, newest first, plus the unread count.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const rawLimit = parseInt(sp.get("limit") || "30", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  const onlyUnread = sp.get("unread") === "1";

  await connectToDatabase();
  const filter: Record<string, unknown> = { userId };
  if (onlyUnread) filter.read = false;
  const [items, unread] = await Promise.all([
    // _id breaks ties for notifications created in the same millisecond.
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId, read: false }),
  ]);
  return NextResponse.json({ items, unreadCount: unread });
}
