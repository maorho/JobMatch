import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { setupTestDb, resetDb } from "../setup/mongo";

// The résumé chat's model: capture what it is asked so the test can see the attachment reach it.
const seen: { system: string; human: string[] }[] = [];
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      seen.push({ system: msgs.filter((m) => m._getType() === "system").map((m) => m.content).join("\n"), human: msgs.filter((m) => m._getType() === "human").map((m) => m.content) });
      return { content: "קיבלתי את הקובץ. רוצה שאשפר את הגרסה הזו?" };
    }
  },
}));

import User from "@/app/models/User";
import { signJwt } from "@/app/lib/jwt";
import { POST as attachPOST } from "@/app/api/chat/attachments/route";
import { POST as chatPOST } from "@/app/api/chat/resume-conversation/route";
import { extractAttachmentText, looksLikeResume, withAttachments, ATTACHMENT_MAX_CHARS } from "@/app/lib/files/extractText";

setupTestDb();

let token = "";
beforeAll(async () => {
  await resetDb();
  const u = await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any);
  token = await signJwt({ id: String(u._id) });
});

async function pdfOf(lines: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 20, size: 12, font }));
  return doc.save();
}
const RESUME = ["Dana Dev", "dana@example.com | +972-50-123-4567", "Experience: Frontend Developer at Acme (2022-2024)", "Education: B.Sc. Computer Science", "Skills: React, TypeScript"];
const form = (files: { name: string; type: string; bytes: Uint8Array | string }[]) => {
  const fd = new FormData();
  for (const f of files) fd.append("files", new File([typeof f.bytes === "string" ? f.bytes : new Uint8Array(f.bytes)], f.name, { type: f.type }));
  return new NextRequest("http://localhost/api/chat/attachments", { method: "POST", body: fd, headers: { cookie: `token=${token}` } } as any);
};

describe("chat attachments: text extraction", () => {
  it("reads PDF and plain text, tells a résumé from another document, and caps long files", async () => {
    const pdf = await extractAttachmentText({ name: "cv.pdf", type: "application/pdf", bytes: await pdfOf(RESUME) });
    expect(pdf.kind).toBe("pdf");
    expect(pdf.text).toContain("Frontend Developer at Acme");
    expect(pdf.looksLikeResume).toBe(true);
    const jd = await extractAttachmentText({ name: "job.txt", type: "text/plain", bytes: new TextEncoder().encode("We are hiring a Senior Backend Engineer. Requirements: Go, Kubernetes, 5+ years.") });
    expect(jd.kind).toBe("text");
    expect(jd.looksLikeResume).toBe(false);
    expect(looksLikeResume("ניסיון: מפתח. השכלה: תואר. dana@x.com")).toBe(true);
    const long = await extractAttachmentText({ name: "notes.md", bytes: new TextEncoder().encode("x".repeat(ATTACHMENT_MAX_CHARS + 500)) });
    expect(long.truncated).toBe(true);
    expect(long.text).toHaveLength(ATTACHMENT_MAX_CHARS);
    expect(long.chars).toBe(ATTACHMENT_MAX_CHARS + 500);
    await expect(extractAttachmentText({ name: "photo.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(extractAttachmentText({ name: "empty.txt", bytes: new Uint8Array() })).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("fences each file under the person's text", () => {
    const s = withAttachments("תסתכל על זה", [{ name: "cv.pdf", text: "Dana Dev" }]);
    expect(s).toContain("תסתכל על זה");
    expect(s).toContain("[קובץ מצורף: cv.pdf]");
    expect(withAttachments("", [{ name: "a.txt", text: "x" }])).toMatch(/^\(הודעה ללא טקסט/);
    expect(withAttachments("hi", [])).toBe("hi");
  });
});

describe("POST /api/chat/attachments", () => {
  it("returns the text of each readable file and names the ones it could not read", async () => {
    const res = await attachPOST(form([
      { name: "cv.pdf", type: "application/pdf", bytes: await pdfOf(RESUME) },
      { name: "job.txt", type: "text/plain", bytes: "Senior Backend Engineer: Go, Kubernetes" },
      { name: "photo.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) },
    ]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files.map((f: any) => [f.name, f.kind, f.looksLikeResume])).toEqual([["cv.pdf", "pdf", true], ["job.txt", "text", false]]);
    expect(body.files[0].text).toContain("dana@example.com");
    expect(body.errors).toEqual([{ name: "photo.png", error: "unsupported" }]);
  });

  it("rejects an anonymous call, an empty form, and a form where nothing is readable", async () => {
    const anon = new NextRequest("http://localhost/api/chat/attachments", { method: "POST", body: new FormData() } as any);
    expect((await attachPOST(anon)).status).toBe(401);
    expect((await attachPOST(form([]))).status).toBe(400);
    const bad = await attachPOST(form([{ name: "x.bin", type: "application/octet-stream", bytes: new Uint8Array([0]) }]));
    expect(bad.status).toBe(422);
  });
});

describe("POST /api/chat/resume-conversation with attachments", () => {
  const chat = (messages: any[]) => chatPOST(new NextRequest("http://localhost/api/chat/resume-conversation", { method: "POST", body: JSON.stringify({ messages }), headers: { cookie: `token=${token}`, "Content-Type": "application/json" } } as any));

  it("hands the attached text to the model under the message and switches the attachment rules on", async () => {
    seen.length = 0;
    const res = await chat([{ role: "user", content: "הנה קורות החיים שלי", attachments: [{ name: "cv.pdf", text: "Dana Dev, dana@example.com. Experience: React developer. Skills: React, TypeScript" }] }]);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toContain("קיבלתי");
    expect(seen).toHaveLength(1);
    expect(seen[0].human[0]).toContain("[קובץ מצורף: cv.pdf]");
    expect(seen[0].human[0]).toContain("React developer");
    expect(seen[0].system).toContain("קבצים מצורפים");
    const u: any = await User.findOne({ email: "dana@test.dev" }).lean();
    expect(u.memory.skills).toEqual(expect.arrayContaining(["react", "typescript"])); // skills in the attached résumé reached memory
  });

  it("keeps the rules off without attachments and refuses too much attached text", async () => {
    seen.length = 0;
    expect((await chat([{ role: "user", content: "שלום" }])).status).toBe(200);
    expect(seen[0].system).not.toContain("קבצים מצורפים");
    const big = "y".repeat(12_000);
    const res = await chat([{ role: "user", content: "a", attachments: [{ name: "1.txt", text: big }, { name: "2.txt", text: big }, { name: "3.txt", text: big }] }]);
    expect(res.status).toBe(413);
  });
});
