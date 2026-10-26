import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE, invalidate } from "@/app/lib/cache";
import { getSearchProfile, saveSearchProfile, PROFILE_ROLE_OPTIONS, EMPTY_PROFILE } from "@/app/lib/matcher/searchProfile";
import { WORK_MODES } from "@/app/lib/jobTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the profile + the options; POST { roles, level, cities, workModes, keywords } → save (the feed re-ranks at once). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = (await getSearchProfile(userId)) || EMPTY_PROFILE;
  return NextResponse.json({ ok: true, profile, options: { roles: PROFILE_ROLE_OPTIONS, levels: ["junior", "mid", "senior"], workModes: WORK_MODES } }, { headers: PRIVATE_CACHE });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const profile = await saveSearchProfile(userId, body);
  invalidate(`rank:${userId}:`); // this instance's cached feed; the memo key also carries the profile version
  return NextResponse.json({ ok: true, profile }, { headers: PRIVATE_CACHE });
}
