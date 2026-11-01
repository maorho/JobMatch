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
import CompanyBrief from "@/app/models/CompanyBrief";

/** The cached research brief for a company, flattened for the prompt; nothing is fetched here (the prep page fills the cache). */
async function companyNotesFor(company: string): Promise<string | undefined> {
  const doc: any = await CompanyBrief.findOne({ key: (company || "").trim().toLowerCase() }).select("brief").lean().catch(() => null);
  const b = doc?.brief;
  if (!b) return undefined;
  const lines = [
    b.summary && `About: ${b.summary}`,
    b.products?.length && `Products: ${b.products.slice(0, 5).join(", ")}`,
    b.recentNews?.length && `Recent: ${b.recentNews.slice(0, 4).map((n: any) => `${n.title}${n.date ? ` (${n.date})` : ""}`).join("; ")}`,
    b.cultureSignals?.length && `Culture: ${b.cultureSignals.slice(0, 3).join("; ")}`,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { contactId, jobId, source, channel?, language?, relationship? } → a personal
 * referral request to that contact about that job. `relationship` is how the
 * sender knows the contact, in their words; it becomes the opening line.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const contactId = String(body?.contactId || "");
  const jobId = String(body?.jobId || "");
  const source = body?.source === "internal" ? "internal" : "external";
  const channel = body?.channel === "email" ? "email" : body?.channel === "note" ? "note" : "linkedin";
  const relationship = typeof body?.relationship === "string" ? body.relationship.trim().slice(0, 300) : "";
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
    const companyNotes = job ? await companyNotesFor(job.company) : undefined;
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    // The whole résumé (within reason): the strongest credential for a role is often a project further down the page.
    const resumeSummary = ((user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "")).slice(0, 3000);
    const draft = await composeOutreach({
      me: { fullname: user?.fullname || "", currentJob: user?.currentJob, resumeSummary },
      contact: { fullName: contact.fullName, position: contact.position, company: contact.company, connectedOn: contact.connectedOn },
      job: { title: job.title, company: job.company, description: job.description, url: body?.url ? String(body.url) : undefined },
      relationship: relationship || undefined,
      companyNotes,
      language,
      channel,
    });
    return NextResponse.json({ ok: true, ...draft, contact: { fullName: contact.fullName, url: contact.url, email: contact.email } });
  } catch (err: any) {
    console.error("❌ outreach:", err);
    return NextResponse.json({ error: err?.message || "Failed to compose" }, { status: 500 });
  }
}
