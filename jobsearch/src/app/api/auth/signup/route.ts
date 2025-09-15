import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '@/app/lib/db';
import User from '@/app/models/User';
import Company from '@/app/models/Company';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

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

  const email = form.get('email')?.toString() || '';
  const password = form.get('password')?.toString() || '';
  const fullname = form.get('fullname')?.toString() || '';
  const username = form.get('username')?.toString() || '';
  const recruiter = form.get('recruiter')?.toString() === 'true';
  const company = form.get('company')?.toString() || '';
  const phone = form.get('phone')?.toString() || '';

  const resumeFile = form.get('resume') as File;

  if (!email || !password || !fullname || !username || !phone || !resumeFile) {
    if(!email){
      return NextResponse.json({ message: 'Missing email' }, { status: 400 });
    }
    else if(!password){
      return NextResponse.json({ message: 'Missing password' }, { status: 400 });
    }
    else if(!fullname){
      return NextResponse.json({ message: 'Missing Full Name' }, { status: 400 });
    }
    else if(!username){
      return NextResponse.json({ message: 'Missing username' }, { status: 400 });
    }
    else if(!phone){
      return NextResponse.json({ message: 'Missing phone number' }, { status: 400 });
    }
    else if(!resumeFile){
      return NextResponse.json({ message: 'Missing resume file' }, { status: 400 });
    }
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return NextResponse.json({ message: 'User already exists' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const buffer = Buffer.from(await resumeFile.arrayBuffer());
  const resumeKey = await uploadToS3(buffer, resumeFile.name, resumeFile.type);

  const userData = {
    email,
    password: hashedPassword,
    fullname,
    username,
    recruiter,
    company: recruiter ? company : '',
    phone,
    resume: resumeKey,
  };

  const newUser = await User.create(userData);

  if (recruiter && company) {
    const existsCompany = await Company.findOne({ companyName: company });
    if (!existsCompany) {
      await Company.create({ companyName: company });
    }
  }

  const token = jwt.sign({ id: newUser._id, email }, JWT_SECRET, { expiresIn: '1h' });

  const response = NextResponse.json({ message: 'Signup successful', recruiter });
  response.cookies.set({
    name: 'token',
    value: token,
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return response;
}
