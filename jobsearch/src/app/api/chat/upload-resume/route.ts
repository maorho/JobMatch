import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("resume") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 8MB)" },
        { status: 413 }
      );
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 415 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfParseModule: any = await import("pdf-parse");
    const pdfData = await pdfParseModule.default(buffer);
    const rawText: string = pdfData.text || "";

    // Feed the Matcher: store the text + embedding so the personalized feed
    // and match scores reflect this résumé immediately. Never blocks the upload.
    let matchReady = false;
    if (rawText.trim()) {
      try {
        matchReady = !!(await embedAndStoreResume(userId, rawText));
      } catch (e) {
        console.warn("[upload-resume] embedding skipped:", (e as Error)?.message);
      }
    }

    return NextResponse.json({ rawText, matchReady });
  } catch (err: any) {
    console.error("❌ upload-resume error:", err);
    return NextResponse.json(
      { error: "Failed to parse PDF", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
