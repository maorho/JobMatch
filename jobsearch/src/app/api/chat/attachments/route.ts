import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, attachmentKind, extractAttachmentText } from "@/app/lib/files/extractText";

export const runtime = "nodejs";

/**
 * Files attached to a ResumeAI chat message (PDF, Word, text). Returns their
 * text so the client can send it with the message; nothing is stored here —
 * the résumé is saved for matching only when the person builds one, as before.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") || []).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
  if (files.length > ATTACHMENT_MAX_FILES) return NextResponse.json({ error: `Up to ${ATTACHMENT_MAX_FILES} files per message` }, { status: 400 });

  const out: any[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const f of files) {
    if (f.size > ATTACHMENT_MAX_BYTES) { errors.push({ name: f.name, error: "too_large" }); continue; }
    if (!attachmentKind(f.name, f.type)) { errors.push({ name: f.name, error: "unsupported" }); continue; }
    try {
      const a = await extractAttachmentText({ name: f.name, type: f.type, bytes: await f.arrayBuffer() });
      out.push(a);
    } catch (e: any) {
      errors.push({ name: f.name, error: e?.code === "EMPTY" ? "empty" : "unreadable" });
    }
  }
  if (!out.length) return NextResponse.json({ error: "No readable files", files: [], errors }, { status: 422 });
  return NextResponse.json({ files: out, errors });
}
