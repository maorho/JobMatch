import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/app/lib/jwt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";

export const runtime = "nodejs";

// זיכרון מטמון לשמירת משתמשים לפי ID
const userCache = new Map<string, any>();
const CACHE_TTL_MS = 60 * 1000; // תקפות המטמון: 60 שניות
const userCacheTimestamps = new Map<string, number>();

export async function GET(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    // אימות ה־JWT באמצעות jose
    const decoded = await verifyJwt<{ id: string }>(token);

    if (!decoded || !decoded.id) {
      return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }

    const userId = decoded.id;
    const now = Date.now();
    const lastFetchTime = userCacheTimestamps.get(userId);
    const cachedUser = userCache.get(userId);

    // אם יש משתמש בזיכרון והוא בתוקף — מחזירים אותו
    if (cachedUser && lastFetchTime && now - lastFetchTime < CACHE_TTL_MS) {
      return NextResponse.json(cachedUser);
    }

    // אחרת — מביאים מה־DB
    await connectToDatabase();
    const user = await User.findById(userId).select("-password");

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

    // שמירה במטמון
    userCache.set(userId, userData);
    userCacheTimestamps.set(userId, now);

    return NextResponse.json(userData);
  } catch (err) {
    console.error("❌ Error verifying token:", err);
    return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
  }
}
