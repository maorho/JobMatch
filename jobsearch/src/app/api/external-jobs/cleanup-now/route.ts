import { NextResponse } from "next/server";
import { AIJobCleanupAgent } from "@/app/lib/AIJobCleanupAgent";
import { connectToDatabase } from "@/app/lib/db";

export async function GET() {
  try {
    await connectToDatabase();
    const agent = new AIJobCleanupAgent();
    const report = await agent.run(); // 👈 רץ מיד, בלי מגבלת זמן
    return NextResponse.json(report);
  } catch (err: any) {
    console.error("❌ Cleanup-now failed:", err);
    return NextResponse.json(
      { message: "Cleanup failed", error: err.message },
      { status: 500 }
    );
  }
}
