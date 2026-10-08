import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Process the signed-in user's stored résumé (from S3) into a profile embedding,
 * so an existing account gets a personalized feed. POST, auth required.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(userId).select("resume");
  const key = user?.resume;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "No résumé on file" },
      { status: 400 }
    );
  }

  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key })
    );
    const buffer = await streamToBuffer(obj.Body as any);

    const pdfParseModule: any = await import("pdf-parse");
    const pdfData = await pdfParseModule.default(buffer);
    const rawText: string = pdfData?.text || "";
    if (!rawText.trim()) {
      return NextResponse.json(
        { ok: false, error: "Could not read résumé text" },
        { status: 422 }
      );
    }

    await embedAndStoreResume(userId, rawText);
    return NextResponse.json({ ok: true, chars: rawText.length });
  } catch (err: any) {
    console.error("❌ process-my-resume error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "processing failed" },
      { status: 500 }
    );
  }
}
