import { NextResponse } from "next/server";
import { PROVIDERS, isConfigured, type Provider } from "@/app/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → which social sign-in providers have keys, so the pages show only buttons that work. */
export async function GET() {
  const providers = (Object.keys(PROVIDERS) as Provider[]).filter(isConfigured);
  return NextResponse.json({ providers }, { headers: { "Cache-Control": "private, max-age=60" } });
}
