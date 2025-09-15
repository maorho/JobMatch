import { NextResponse } from "next/server";
import { AIJobCleanupAgent } from "@/app/lib/AIJobCleanupAgent";

export async function GET() {
  try {
    const agent = new AIJobCleanupAgent();
    const result = await agent.run();
    return NextResponse.json({
      message: "Job cleanup completed",
      ...result,
    });
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    return NextResponse.json(
      { message: "Failed to run cleanup agent" },
      { status: 500 }
    );
  }
}