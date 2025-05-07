import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '@/app/lib/db';
import User from '@/app/models/User';
import Company from '@/app/models/Company';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export async function POST(req: NextRequest) {
  const { email, password, fullname, username , recruiter, company } = await req.json();

  await connectToDatabase();

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return NextResponse.json({ message: 'User already exists' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({ email, password: hashedPassword, fullname, username , recruiter, company  });

  if(recruiter){
    const existingCompany = await Company.findOne({ companyName: company });
    if (!existingCompany) {
        await Company.create({ companyName: company });
    }
  }
  const token = jwt.sign({ id: newUser._id, email }, JWT_SECRET, { expiresIn: '1h' });

  const response = NextResponse.json({ message: 'Signup successful', recruiter:recruiter});
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
