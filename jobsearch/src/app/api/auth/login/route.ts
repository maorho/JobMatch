import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { signJwt } from "@/app/lib/jwt";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  console.log("Attempting login for user:", email);

  await connectToDatabase();

  const user = await User.findOne({ email });
  const recruiter = user?.recruiter ? true : false;
  const admin = user?.admin ? true : false; 

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }

  const token = await signJwt(
    { id: String(user._id), email: user.email, admin },
    { expiresIn: "1h" }
  );

  const response = NextResponse.json({
    message: "Login successful",
    recruiter,
    admin
  });

  response.cookies.set({
    name: "token",
    value: token,
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}
