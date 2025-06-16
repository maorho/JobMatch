import { connectToDatabase } from '@/app/lib/db';
import Company from '@/app/models/Company';
import Job from '@/app/models/Job';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const {
    job,
    company,
    type,
    city,
    country,
    link,
    outsidesource,
    description,
    qualifications,
    publisher
  } = await req.json();

  await connectToDatabase();
  const foundCompany = await Company.findOne({ companyName: company });
  if (!foundCompany) {
    return NextResponse.json({ message: "Company not found" }, { status: 404 });
  }
  const newJob = await Job.create({
    job,
    company:foundCompany._id,
    companyName:company,
    type,
    city,
    country,
    link: outsidesource ? link : "",         // אם מדובר במשרה מבחוץ
    outsidesource: !!outsidesource,          // ודא שזה Boolean
    description: outsidesource ? "" : description,
    qualifications: outsidesource ? "" : qualifications,
    publisher
  });

  return NextResponse.json({ message: 'Position Added Successfully', jobId: newJob._id });
}
