import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import ContactMessage from "@/app/models/ContactMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().max(200).default(""),
  message: z.string().trim().min(10).max(5000),
  // Honeypot: real users never fill this hidden field (bots get a quiet 200 below).
  website: z.string().optional(),
});

/** POST /api/contact — store a Contact Us message (and notify admins by email when configured). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }
  if (parsed.data.website) return NextResponse.json({ ok: true }); // bot: pretend success

  try {
    await connectToDatabase();
    const userId = await getUserIdFromRequest(req).catch(() => null);
    const doc = await ContactMessage.create({ ...parsed.data, userId: userId || undefined });

    // Optional email relay (Resend) — skipped silently when not configured.
    if (process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.CONTACT_FROM_EMAIL || "JobMatch <onboarding@resend.dev>",
            to: [process.env.CONTACT_TO_EMAIL],
            reply_to: parsed.data.email,
            subject: `[Contact] ${parsed.data.subject || "(no subject)"} — ${parsed.data.name}`,
            text: `${parsed.data.message}\n\n— ${parsed.data.name} <${parsed.data.email}>`,
          }),
        });
      } catch (e) {
        console.warn("[contact] email relay failed:", (e as Error)?.message);
      }
    }
    return NextResponse.json({ ok: true, id: String(doc._id) });
  } catch (err) {
    console.error("❌ contact error:", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
