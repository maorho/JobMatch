import { connectToDatabase } from "@/app/lib/db";
import ReferralRequest from "@/app/models/ReferralRequest";
import { companyKey } from "@/app/lib/outcomes/companyKey";

/** For the outcome features: has this candidate been referred by an insider (accepted or submitted) at this company? Kept apart from insiders.ts so outcomes.ts doesn't import a module that imports it back. */
export async function hasInsiderReferral(candidateId: string, company: string): Promise<boolean> {
  await connectToDatabase();
  return !!(await ReferralRequest.exists({ candidateId, companyKey: companyKey(company), status: { $in: ["accepted", "submitted"] } }));
}
