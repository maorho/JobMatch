import { NextRequest, NextResponse } from "next/server";
import { maybeRunExternalJobsCleanup } from "@/app/lib/maybeRunExternalJobsCleanup";

export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const triggered = await maybeRunExternalJobsCleanup();
  return NextResponse.json({ triggered });
}
