import { NextResponse } from "next/server";
import { maybeRunExternalJobsCleanup } from "@/app/lib/maybeRunExternalJobsCleanup";

export async function GET() {
  const triggered = await maybeRunExternalJobsCleanup();
  return NextResponse.json({ triggered });
}
