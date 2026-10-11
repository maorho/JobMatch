import { NextResponse } from "next/server";
import { phoneConfigured } from "@/app/lib/interview/phone";

export const dynamic = "force-dynamic";

/** Is the phone channel available on this deployment? */
export async function GET() {
  return NextResponse.json({ ok: true, configured: phoneConfigured(), model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini" });
}
