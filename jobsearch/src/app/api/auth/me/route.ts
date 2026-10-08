import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/app/lib/jwt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const decoded = await verifyJwt<{ id: string }>(token);

    if (!decoded || !decoded.id) {
      return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }

    // Always read fresh from the DB: a role/approval change must take effect
    // immediately (the old 60s in-memory cache served stale data and grew
    // unbounded on a long-lived server).
    await connectToDatabase();
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
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

    return NextResponse.json(userData);
  } catch (err) {
    console.error("❌ Error verifying token:", err);
    return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
  }
}
