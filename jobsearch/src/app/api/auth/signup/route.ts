import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { signJwt, SESSION_COOKIE } from "@/app/lib/jwt";
import { connectToDatabase } from "@/app/lib/db";
import { clientIp, enforceRateLimits, HOUR_MS } from "@/app/lib/ops/rateLimit";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import User from "@/app/models/User";
import Company from "@/app/models/Company";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { attachPartner, REF_COOKIE } from "@/app/lib/partners/partners";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8 MB, same as chat/upload-resume

// The object key never carries the client's filename: a random id + ".pdf".
async function uploadToS3(buffer: Buffer): Promise<string> {
  const key = `resumes/${uuidv4()}.pdf`;
  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
  };
  await s3.send(new PutObjectCommand(uploadParams));
  return key;
}

export async function POST(req: NextRequest) {
  // 5 new accounts per hour per address.
  const limited = await enforceRateLimits([{ key: `signup:ip:${clientIp(req)}`, max: 5, windowMs: HOUR_MS }]);
  if (limited) return limited;

  await connectToDatabase();

  const form = await req.formData();

  const email = (form.get("email")?.toString() || "").trim().toLowerCase();
  const password = form.get("password")?.toString() || "";
  const fullname = form.get("fullname")?.toString() || "";
  const username = form.get("username")?.toString() || "";
  const recruiter = form.get("recruiter")?.toString() === "true";
  // Admin accounts are NEVER self-granted at signup (client input ignored).
  const admin = false;
  const company = form.get("company")?.toString() || "";
  const phone = form.get("phone")?.toString() || "";
  const resumeFile = form.get("resume") as File | null;
  // Partner invite code: from the signup form (?ref= on the page) or the cookie the landing page set.
  const ref = (form.get("ref")?.toString() || req.cookies.get(REF_COOKIE)?.value || "").trim();

  
  if (!email || !password || !fullname || !username || !phone) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  if (recruiter && !company) {
    return NextResponse.json({ message: "Recruiter must specify a company name" }, { status: 400 });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return NextResponse.json({ message: "User already exists" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);


  let resumeKey = "";
  let resumeBuffer: Buffer | null = null;
  if (!admin) {
    if (!resumeFile) {
      return NextResponse.json({ message: "Missing resume file" }, { status: 400 });
    }
    if (resumeFile.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ message: "File too large (max 8MB)" }, { status: 400 });
    }
    const isPdf = resumeFile.type === "application/pdf" || resumeFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ message: "Only PDF files are supported" }, { status: 400 });
    }
    resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    resumeKey = await uploadToS3(resumeBuffer);
  }

  // ✅ טיפול בחברה
  let company_id: mongoose.Types.ObjectId | null = null;
  if ((recruiter || admin) && company) {
    let companyDoc = await Company.findOne({ companyName: company });
    if (!companyDoc) {
      if (recruiter) {
        return NextResponse.json({ message: "Company not found" }, { status: 404 });
      }
      companyDoc = await Company.create({ companyName: company });
    }
    company_id = companyDoc._id;
  }

  // ✅ יצירת המשתמש
  const userData: any = {
    email,
    password: hashedPassword,
    fullname,
    username,
    recruiter,
    admin,
    // A recruiter starts unapproved no matter what the form sent; an admin flips it.
    approved: false,
    company_id,
    company: recruiter || admin ? company : "",
    phone,
  };

  if (!admin) userData.resume = resumeKey;

  const newUser = new User(userData);
  await newUser.save();
  if (ref && !recruiter) await attachPartner(String(newUser._id), ref).catch((e) => console.warn("[signup] partner attach skipped:", (e as Error)?.message));

  // Process the résumé for the personalized feed: extract text → embedding.
  // Best-effort — never fail signup because of it.
  if (resumeBuffer) {
    try {
      const { extractPdfText } = await import("@/app/lib/pdf/extractText");
      const { text: rawText } = await extractPdfText(resumeBuffer);
      if (rawText.trim()) {
        await embedAndStoreResume(String(newUser._id), rawText);
      }
    } catch (e) {
      console.error("⚠️ résumé embedding at signup failed:", e);
    }
  }

  // ✅ יצירת טוקן
  const token = await signJwt({ id: String(newUser._id), email, admin: false });

  const response = NextResponse.json({ message: "Signup successful", recruiter });
  response.cookies.set({ ...SESSION_COOKIE, value: token });

  return response;
}