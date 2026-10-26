import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import Notification from "@/app/models/Notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read  { ids?: string[], all?: true }
 * Marks the caller's notifications as read (never anyone else's).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  await connectToDatabase();

  if (body?.all === true) {
    const r = await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    return NextResponse.json({ ok: true, updated: r.modifiedCount });
  }
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && mongoose.isValidObjectId(id)) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Provide ids[] or all:true" }, { status: 400 });
  const r = await Notification.updateMany({ _id: { $in: ids }, userId }, { $set: { read: true } });
  return NextResponse.json({ ok: true, updated: r.modifiedCount });
}
