import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfParseModule: any = await import("pdf-parse");
    const pdfData = await pdfParseModule.default(buffer);
    const rawText: string = pdfData.text || "";

    return NextResponse.json({ rawText });
  } catch (err: any) {
    console.error("❌ upload-resume error:", err);
    return NextResponse.json(
      { error: "Failed to parse PDF", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
