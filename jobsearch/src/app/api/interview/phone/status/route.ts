import { NextResponse } from "next/server";
import { phoneConfigured } from "@/app/lib/interview/phone";
import { FEATURES } from "@/app/lib/flags";

export const dynamic = "force-dynamic";

/** Is the phone channel available on this deployment? */
export async function GET() {
  // Behind FEATURE_PHONE until it has been tested on real calls.
  return NextResponse.json({ ok: true, configured: FEATURES.phone && phoneConfigured(), model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini" });
}
