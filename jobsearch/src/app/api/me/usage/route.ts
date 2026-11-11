import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { usageForUser } from "@/app/lib/ops/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the signed-in person's plan and what they have used this month of the free allowance (Settings page). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usage = await usageForUser(userId);
  return NextResponse.json({ ok: true, ...usage }, { headers: { "Cache-Control": "private, no-store" } });
}
