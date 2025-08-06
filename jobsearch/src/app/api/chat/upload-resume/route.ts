import { NextRequest, NextResponse } from "next/server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("resume") as File;

    if (!file) {
      return NextResponse.json({ error: "Resume file is required." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tempPath = path.join(os.tmpdir(), file.name);
    await fs.writeFile(tempPath, buffer);

    const loader = new PDFLoader(tempPath, { splitPages: false });
    const docs = await loader.load();
    const rawText = docs.map((doc) => doc.pageContent).join("\n");

    await fs.unlink(tempPath);

    return NextResponse.json({ rawText });
  } catch (error) {
    console.error("❌ Error reading PDF:", error);
    return NextResponse.json({ error: "Failed to parse resume." }, { status: 500 });
  }
}
