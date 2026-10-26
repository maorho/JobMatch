import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { verifyJwt, tokenVersionMatches } from "./jwt";
import { connectToDatabase } from "./db";
import User from "@/app/models/User";

/**
 * The authenticated user id from the `token` cookie, or null.
 * Beyond the signature, the session must still be live: the user exists
 * (account deletion revokes) and the token's `tv` equals User.tokenVersion
 * (a password change/reset revokes). That costs one indexed, projected
 * findById per authenticated request — accepted for real revocation.
 * A DB failure throws (callers surface a 500) rather than reading as "signed out".
 */
export async function getUserIdFromRequest(req: NextRequest) {
  return getUserIdFromToken(req.cookies.get("token")?.value);
}

/** Same check for callers that only have the cookie value (server components use `cookies()`). */
export async function getUserIdFromToken(token: string | undefined | null) {
  if (!token) return null;

  const decoded = await verifyJwt<{ id: string; tv?: number }>(token).catch(() => null);
  const id = decoded?.id;
  if (!id || !mongoose.isValidObjectId(id)) return null;

  await connectToDatabase();
  const user = await User.findById(id).select("tokenVersion").lean<{ tokenVersion?: number }>();
  if (!user || !tokenVersionMatches(decoded, user.tokenVersion)) return null;
  return id;
}