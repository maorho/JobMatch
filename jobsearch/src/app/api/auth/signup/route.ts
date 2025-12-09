import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import Company from "@/app/models/Company";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function uploadToS3(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const key = `resumes/${uuidv4()}-${fileName}`;
  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  };
  await s3.send(new PutObjectCommand(uploadParams));
  return key;
}

export async function POST(req: NextRequest) {
  await connectToDatabase();

  const form = await req.formData();

  const email = form.get("email")?.toString() || "";
  const password = form.get("password")?.toString() || "";
  const fullname = form.get("fullname")?.toString() || "";
  const username = form.get("username")?.toString() || "";
  const recruiter = form.get("recruiter")?.toString() === "true";
  const admin = form.get("admin")?.toString() === "true";
  const company = form.get("company")?.toString() || "";
  const phone = form.get("phone")?.toString() || "";
  const resumeFile = form.get("resume") as File | null;

  
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
  if (!admin) {
    if (!resumeFile) {
      return NextResponse.json({ message: "Missing resume file" }, { status: 400 });
    }
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    resumeKey = await uploadToS3(buffer, resumeFile.name, resumeFile.type);
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
    company_id,
    company: recruiter || admin ? company : "",
    phone,
  };

  if (!admin) userData.resume = resumeKey;

  const newUser = new User(userData);
  await newUser.save();

  // ✅ יצירת טוקן
  const token = jwt.sign({ id: newUser._id, email }, JWT_SECRET, { expiresIn: "1h" });

  const response = NextResponse.json({ message: "Signup successful", recruiter });
  response.cookies.set({
    name: "token",
    value: token,
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  return response;
}