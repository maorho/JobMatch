import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import JobSignal, { type SignalKind } from "@/app/models/JobSignal";
import ExternalJobs from "@/app/models/ExternalJobs";
import Job from "@/app/models/Job";
import { invalidate } from "@/app/lib/cache";

/** Save / dismiss a posting, or undo. Dismissing clears a save and vice versa. */
export async function setSignal(userId: string, input: { jobId: string; jobModel?: "Job" | "ExternalJobs"; kind: SignalKind; on: boolean; matchScore?: number | null }): Promise<{ saved: boolean; dismissed: boolean }> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(input.jobId)) return { saved: false, dismissed: false };
  const jobModel = input.jobModel === "Job" ? "Job" : "ExternalJobs";
  if (input.on) {
    const job: any = jobModel === "Job" ? await Job.findById(input.jobId).select("job company").populate("company", "companyName").lean() : await ExternalJobs.findById(input.jobId).select("job company").lean();
    const other: SignalKind = input.kind === "saved" ? "dismissed" : "saved";
    await JobSignal.deleteOne({ userId, jobId: input.jobId, kind: other });
    await JobSignal.updateOne(
      { userId, jobId: input.jobId, kind: input.kind },
      { $setOnInsert: { userId, jobId: input.jobId, jobModel, kind: input.kind, company: jobModel === "Job" ? job?.company?.companyName || "" : job?.company || "", title: job?.job || "", matchScore: input.matchScore ?? null } },
      { upsert: true }
    );
  } else {
    await JobSignal.deleteOne({ userId, jobId: input.jobId, kind: input.kind });
  }
  invalidate(`rank:${userId}:`);
  const rows: any[] = await JobSignal.find({ userId, jobId: input.jobId }).select("kind").lean();
  return { saved: rows.some((r) => r.kind === "saved"), dismissed: rows.some((r) => r.kind === "dismissed") };
}

/** Ids by kind — what the feed and the cards need. */
export async function signalsFor(userId: string): Promise<{ saved: string[]; dismissed: string[] }> {
  await connectToDatabase();
  const rows: any[] = await JobSignal.find({ userId }).select("jobId kind").lean();
  return { saved: rows.filter((r) => r.kind === "saved").map((r) => String(r.jobId)), dismissed: rows.filter((r) => r.kind === "dismissed").map((r) => String(r.jobId)) };
}

export async function dismissedIds(userId: string): Promise<Set<string>> {
  await connectToDatabase();
  const rows: any[] = await JobSignal.find({ userId, kind: "dismissed" }).select("jobId").lean();
  return new Set(rows.map((r) => String(r.jobId)));
}

/** The saved list with the posting's current details (gone postings still show their title). */
export async function savedJobs(userId: string, limit = 100) {
  await connectToDatabase();
  const rows: any[] = await JobSignal.find({ userId, kind: "saved" }).sort({ createdAt: -1 }).limit(limit).lean();
  const ext: any[] = await ExternalJobs.find({ _id: { $in: rows.filter((r) => r.jobModel !== "Job").map((r) => r.jobId) } }).select("job company city country remote logoUrl companyDomain finalUrl url postedAt").lean();
  const byId = new Map(ext.map((j) => [String(j._id), j]));
  return rows.map((r) => {
    const j = byId.get(String(r.jobId));
    return { jobId: String(r.jobId), jobModel: r.jobModel, savedAt: r.createdAt, title: j?.job || r.title, company: j?.company || r.company, city: j?.city || "", remote: !!j?.remote, logoUrl: j?.logoUrl || "", companyDomain: j?.companyDomain || "", gone: !j && r.jobModel !== "Job", matchScore: r.matchScore };
  });
}
