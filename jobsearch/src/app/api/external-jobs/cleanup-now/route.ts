import { NextResponse,NextRequest } from "next/server";
import { AIJobCleanupAgent } from "@/app/lib/AIJobCleanupAgent";
import { connectToDatabase } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cron_secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
