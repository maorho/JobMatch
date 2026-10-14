import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE, PUBLIC_CACHE } from "@/app/lib/cache";
import { insidersAt, registerInsider, verifyInsider, updateInsider, myInsiderProfiles } from "@/app/lib/referrals/insiders";
import { enforceRateLimits, HOUR_MS } from "@/app/lib/ops/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?company=Acme → insiders there (first names only). GET (signed in, no company) → my insider profiles. */
export async function GET(req: NextRequest) {
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  if (company) {
    const insiders = await insidersAt(company);
    return NextResponse.json({ ok: true, company, count: insiders.length, available: insiders.filter((i) => i.available).length, insiders }, { headers: PUBLIC_CACHE });
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, profiles: await myInsiderProfiles(userId) }, { headers: PRIVATE_CACHE });
}

/** POST { company, title, workEmail, capacity?, note? } → sends the verification code to the work address. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // 3 code mails per hour per person: the work address is someone else's inbox.
  const limited = await enforceRateLimits([{ key: `insider-register:${userId}`, max: 3, windowMs: HOUR_MS }]);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const r = await registerInsider(userId, { company: String(body.company || ""), title: String(body.title || ""), workEmail: String(body.workEmail || ""), capacity: body.capacity ? Number(body.capacity) : undefined, note: typeof body.note === "string" ? body.note : undefined });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: PRIVATE_CACHE });
}

/** PUT { company, code } → verify; PUT { company, active|capacity|note|title } → update. */
export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const company = String(body.company || "");
  if (body.code) {
    // 20 verification attempts per hour per person (each code also dies after 5 wrong guesses).
    const limited = await enforceRateLimits([{ key: `insider-verify:${userId}`, max: 20, windowMs: HOUR_MS }]);
    if (limited) return limited;
    const r = await verifyInsider(userId, company, String(body.code));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: PRIVATE_CACHE });
  }
  const ok = await updateInsider(userId, company, { active: typeof body.active === "boolean" ? body.active : undefined, capacity: typeof body.capacity === "number" ? body.capacity : undefined, note: typeof body.note === "string" ? body.note : undefined, title: typeof body.title === "string" ? body.title : undefined });
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: PRIVATE_CACHE });
}
