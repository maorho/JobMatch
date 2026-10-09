import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";

/** One job for the job page (server-rendered), as plain JSON with `source` set. */
export async function loadJob(source: string, id: string): Promise<any | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectToDatabase();
  if (source === "internal") {
    const j: any = await Job.findById(id).populate({ path: "company", model: Company }).lean();
    return j ? JSON.parse(JSON.stringify({ ...j, source: "internal" })) : null;
  }
  if (source === "external") {
    const j: any = await ExternalJobs.findById(id).lean();
    return j ? JSON.parse(JSON.stringify({ ...j, source: "external", embedding: undefined })) : null;
  }
  return null;
}
