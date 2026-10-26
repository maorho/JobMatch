import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import ReferralRequest from "@/app/models/ReferralRequest";
import User from "@/app/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals/requests/:id/resume — the candidate's résumé, for the insider
 * who received this request only (and only while it is not declined/withdrawn/expired).
 * Redirects to a 5-minute signed S3 URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectToDatabase();
  const r: any = await ReferralRequest.findOne({ _id: id, referrerUserId: userId, status: { $in: ["requested", "accepted", "submitted"] } }).select("candidateId").lean();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const candidate: any = await User.findById(r.candidateId).select("resume").lean();
  const key: string = candidate?.resume || "";
  if (!key || !key.startsWith("resumes/")) return NextResponse.json({ error: "No résumé on file" }, { status: 404 });
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.S3_BUCKET_NAME) return NextResponse.json({ error: "File storage not configured" }, { status: 503 });
  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-north-1", credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }), { expiresIn: 300 });
  return NextResponse.redirect(url, { status: 302 });
}
