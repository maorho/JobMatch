import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import ExternalJobs from "@/app/models/ExternalJobs";
import { loadCandidateProfile } from "@/app/lib/matcher/hybrid";
import { rerankForUser } from "@/app/lib/matcher/rerank";
import { levelFit } from "@/app/lib/matcher/level";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import { interviewLikelihood } from "@/app/lib/matcher/likelihood";
import { seniorityOf } from "@/app/lib/jobTaxonomy";
import { contactsAtCompany } from "@/app/lib/contacts/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET ?jobId= → the reranker's verdict for this user and posting: fit, why, gaps (cached). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId") || "";
  if (!mongoose.Types.ObjectId.isValid(jobId)) return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  await connectToDatabase();
  const [profile, job]: [any, any] = await Promise.all([loadCandidateProfile(userId), ExternalJobs.findById(jobId).select("+embedding job company description city country seniority").lean()]);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!profile?.resumeSummary) return NextResponse.json({ ok: true, ready: false, reason: "NO_RESUME" });
  const lf = levelFit(profile.level, job.job, job.seniority);
  const heuristic = profile.vector && Array.isArray(job.embedding) ? Math.round(toMatchScore(cosineSimilarity(profile.vector, job.embedding)) * (0.55 + 0.45 * lf)) : null;
  const verdicts = await rerankForUser({ userId, resumeVersion: profile.resumeVersion, resumeSummary: profile.resumeSummary, level: profile.level, jobs: [{ _id: jobId, job: job.job, company: job.company, description: job.description || "", city: job.city, country: job.country, seniority: job.seniority }] });
  const v = verdicts.get(jobId);
  const fit = v?.fit ?? heuristic;
  const hasReferral = (await contactsAtCompany(userId, job.company, 1).catch(() => [])).length > 0;
  const likelihood = await interviewLikelihood({ matchScore: fit, cosine: profile.vector && Array.isArray(job.embedding) ? cosineSimilarity(profile.vector, job.embedding) : null, levelFit: lf, rerankFit: v?.fit ?? null, level: profile.level, jobSeniority: String(seniorityOf(job.job, job.seniority) || "").toLowerCase(), hasReferral });
  return NextResponse.json({ ok: true, ready: true, level: profile.level, levelFit: lf, heuristic, fit, why: v?.why || "", gaps: v?.gaps || [], reranked: !!v, likelihood });
}
