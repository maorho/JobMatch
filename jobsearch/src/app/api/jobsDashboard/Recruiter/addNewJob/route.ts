import { connectToDatabase } from '@/app/lib/db';
import Company from '@/app/models/Company';
import Job from '@/app/models/Job';
import { NextRequest, NextResponse } from 'next/server';
import { requireRecruiterOrAdmin, recruiterDenied } from '@/app/lib/authGuard';

export async function POST(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (!auth) return recruiterDenied(req);

  const {
    job,
    company: bodyCompany,
    type,
    city,
    country,
    link,
    outsidesource,
    description,
    qualifications,
  } = await req.json();

  // The posting belongs to the signed-in recruiter and their company — never
  // to whatever publisher/company the form named. An admin (no company of
  // their own) may post on behalf of any company.
  const company = auth.admin && !auth.company ? String(bodyCompany || "") : auth.company;
  if (!company) {
    return NextResponse.json({ message: "Company not found" }, { status: 404 });
  }

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
    publisher: auth.id,
  });

  return NextResponse.json({ message: 'Position Added Successfully', jobId: newJob._id });
}
