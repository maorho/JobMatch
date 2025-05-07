import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '@/app/lib/db';
import User from '@/app/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  await connectToDatabase();

  // בדוק אם המשתמש קיים
  const user = await User.findOne({ email });
  const recruiter = (user.recruiter)?true:false;
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  // בדוק אם הסיסמה תואמת
  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  // צור טוקן JWT
  const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
    expiresIn: '1h',
  });

  // שלח עוגייה עם הטוקן
  const response = NextResponse.json({ message: 'Login successful' ,recruiter:recruiter});

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
