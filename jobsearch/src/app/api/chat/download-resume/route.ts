import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { renderResumePdf } from "@/app/lib/resume/renderPdf";
import { isStructuredResume } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";

/** POST { structuredResume } → the résumé as a PDF (see lib/resume/renderPdf). */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const resume = body?.structuredResume;
    if (!isStructuredResume(resume)) return NextResponse.json({ error: "Invalid resume format" }, { status: 400 });

    const pdfBytes = await renderResumePdf(resume);
    const name = String(resume.find((s) => String(s.heading).toLowerCase() === "header")?.items?.[0]?.title || "Resume").replace(/[^\w\- ]+/g, "").trim() || "Resume";
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/\s+/g, "-")}-CV.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("❌ download-resume error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
