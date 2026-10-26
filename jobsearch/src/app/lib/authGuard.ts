import { NextRequest, NextResponse } from "next/server";
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
 * Resolve the authenticated user and assert they are an admin, or a recruiter
 * an admin has approved. A recruiter who is still pending gets null like any
 * other outsider — the dashboard already shows them the "waiting for
 * approval" notice instead of the tools.
 */
export async function requireRecruiterOrAdmin(
  req: NextRequest
): Promise<{ id: string; admin: boolean; company: string } | null> {
  const id = await getUserIdFromRequest(req);
  if (!id) return null;
  await connectToDatabase();
  const user = await User.findById(id).select("admin recruiter approved company");
  if (!user) return null;
  const approvedRecruiter = !!user.recruiter && user.approved === true;
  if (!user.admin && !approvedRecruiter) return null;
  return { id, admin: !!user.admin, company: user.company || "" };
}

/** Message for a signed-in recruiter whose account an admin has not approved yet. */
export const RECRUITER_PENDING_MESSAGE = "החשבון ממתין לאישור מנהל";

/**
 * The response to send when requireRecruiterOrAdmin returned null: 403 with a
 * clear message for a recruiter still waiting for approval, 401 otherwise.
 */
export async function recruiterDenied(req: NextRequest): Promise<NextResponse> {
  const id = await getUserIdFromRequest(req);
  if (id) {
    await connectToDatabase();
    const user = await User.findById(id).select("recruiter approved").lean();
    if (user?.recruiter && user.approved !== true) {
      return NextResponse.json({ error: "Forbidden", message: RECRUITER_PENDING_MESSAGE }, { status: 403 });
    }
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
