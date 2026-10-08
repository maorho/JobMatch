import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "./getUserIdFromRequest";
import { connectToDatabase } from "./db";
import User from "@/app/models/User";

/** The authenticated user id from the JWT cookie, or null. */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  return getUserIdFromRequest(req);
}

/**
 * Resolve the authenticated user and assert they are an admin.
 * Returns the user id when admin, otherwise null (caller returns 401/403).
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ id: string } | null> {
  const id = await getUserIdFromRequest(req);
  if (!id) return null;
  await connectToDatabase();
  const user = await User.findById(id).select("admin");
  if (!user || !user.admin) return null;
  return { id };
}

/**
 * Resolve the authenticated user and assert they are a recruiter or admin.
 */
export async function requireRecruiterOrAdmin(
  req: NextRequest
): Promise<{ id: string; admin: boolean; company: string } | null> {
  const id = await getUserIdFromRequest(req);
  if (!id) return null;
  await connectToDatabase();
  const user = await User.findById(id).select("admin recruiter company");
  if (!user || (!user.admin && !user.recruiter)) return null;
  return { id, admin: !!user.admin, company: user.company || "" };
}
