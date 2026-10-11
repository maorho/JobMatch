import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import { issueApiKey, revokeApiKey } from "@/app/lib/auth/apiKey";
import { siteUrl } from "@/app/lib/seo/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → whether a key exists (prefix only); POST → issue/rotate (key returned once); DELETE → revoke. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const u: any = await User.findById(userId).select("apiKeyPrefix apiKeyCreatedAt").lean();
  return NextResponse.json({ ok: true, hasKey: !!u?.apiKeyPrefix, prefix: u?.apiKeyPrefix || "", createdAt: u?.apiKeyCreatedAt || null, endpoint: `${siteUrl()}/api/mcp` });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, prefix } = await issueApiKey(userId);
  return NextResponse.json({ ok: true, key, prefix, endpoint: `${siteUrl()}/api/mcp` });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await revokeApiKey(userId);
  return NextResponse.json({ ok: true });
}
