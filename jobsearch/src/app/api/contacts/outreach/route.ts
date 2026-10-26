import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Contact from "@/app/models/Contact";
import { loadJobForPrep } from "@/app/lib/interview/ensurePlan";
import { composeOutreach } from "@/app/lib/contacts/outreach";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { contactId, jobId, source, channel?, language? } → a personal
 * referral request to that contact about that job.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const contactId = String(body?.contactId || "");
  const jobId = String(body?.jobId || "");
  const source = body?.source === "internal" ? "internal" : "external";
  const channel = body?.channel === "email" ? "email" : "linkedin";
  const language = body?.language === "en" ? "en" : "he";
  if (!mongoose.Types.ObjectId.isValid(contactId) || !mongoose.Types.ObjectId.isValid(jobId)) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  // Daily cap on this paid action (lib/ops/quota.ts); 429 with a hint when spent.
  try {
    await consumeQuota(userId, "outreach");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }

  try {
    await connectToDatabase();
    const [contact, job, user]: any[] = await Promise.all([
      Contact.findOne({ _id: contactId, userId }).lean(),
      loadJobForPrep(source, jobId),
      User.findById(userId).select("+resumeText +resumeStructured fullname currentJob").lean(),
    ]);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const resumeSummary = ((user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "")).slice(0, 1500);
    const draft = await composeOutreach({
      me: { fullname: user?.fullname || "", currentJob: user?.currentJob, resumeSummary },
      contact: { fullName: contact.fullName, position: contact.position, company: contact.company },
      job: { title: job.title, company: job.company, description: job.description, url: body?.url ? String(body.url) : undefined },
      language,
      channel,
    });
    return NextResponse.json({ ok: true, ...draft, contact: { fullName: contact.fullName, url: contact.url, email: contact.email } });
  } catch (err: any) {
    console.error("❌ outreach:", err);
    return NextResponse.json({ error: err?.message || "Failed to compose" }, { status: 500 });
  }
}
