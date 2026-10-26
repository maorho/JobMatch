import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyJwt, signJwt, sessionClaims, tokenVersionMatches, JWT_REFRESH_BELOW_SEC, SESSION_COOKIE } from "@/app/lib/jwt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  // 401 only for a missing/invalid/revoked session; anything else (DB down) is
  // a 500 so the client keeps its user instead of showing "session expired".
  const decoded = await verifyJwt<{ id: string; exp?: number; tv?: number }>(token).catch(() => null);
  if (!decoded || !decoded.id || !mongoose.isValidObjectId(decoded.id)) {
    return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
  }

  try {
    // Always read fresh from the DB: a role/approval change must take effect
    // immediately (the old 60s in-memory cache served stale data and grew
    // unbounded on a long-lived server).
    await connectToDatabase();
    const user = await User.findById(decoded.id).select("-password");

    // A deleted account or a bumped tokenVersion (password change/reset) revokes the session.
    if (!user || !tokenVersionMatches(decoded, user.tokenVersion)) {
      const res = NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
      res.cookies.set({ ...SESSION_COOKIE, value: "", maxAge: 0 });
      return res;
    }

    const userData = {
      id: user._id,
      email: user.email,
      fullname: user.fullname,
      createdAt: user.createdAt,
      recruiter: user.recruiter,
      admin:user.admin,
      approved:user.approved,
      phone: user.phone,
      resumeUrl:user.resume,
      company:user.company,
    };

    const res = NextResponse.json(userData);
    // Sliding session: once less than half the token's life is left, issue a
    // fresh one (same payload shape as login) so active people never get
    // logged out mid-session.
    const remaining = (decoded.exp || 0) - Math.floor(Date.now() / 1000);
    if (remaining < JWT_REFRESH_BELOW_SEC) {
      const fresh = await signJwt(sessionClaims(user));
      res.cookies.set({ ...SESSION_COOKIE, value: fresh });
    }
    return res;
  } catch (err) {
    console.error("❌ /api/auth/me failed:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
