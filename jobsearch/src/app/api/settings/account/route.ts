import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import InterviewPrep from "@/app/models/InterviewPrep";
import Conversation from "@/app/models/Conversation";
import Message from "@/app/models/Message";
import Contact from "@/app/models/Contact";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import InterviewSession from "@/app/models/InterviewSession";
import AutoApplication from "@/app/models/AutoApplication";
import PracticeAttempt from "@/app/models/PracticeAttempt";
import Referrer from "@/app/models/Referrer";
import ReferralRequest from "@/app/models/ReferralRequest";
import MatchCache from "@/app/models/MatchCache";
import JobSignal from "@/app/models/JobSignal";
import ContactMessage from "@/app/models/ContactMessage";
import UsageCounter from "@/app/models/UsageCounter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best-effort: drop the résumé PDF from S3 (a failure is logged, never blocks the deletion). */
async function deleteResumeObject(key: string): Promise<void> {
  if (!key || !process.env.S3_BUCKET_NAME) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
    });
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }));
  } catch (e) {
    console.error("⚠️ account delete: résumé object not removed:", (e as Error)?.message);
  }
}

/**
 * DELETE /api/settings/account { confirm: "DELETE" }
 * Deletes the account and every row keyed to the person: applications and
 * their outcomes/events, notifications, interview plans and sessions,
 * practice, messages, contacts, referrals (as insider and as requester),
 * match caches, signals, usage counters, and the résumé file in S3. Jobs a
 * recruiter published are kept.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: 'Send { "confirm": "DELETE" }' }, { status: 400 });

  await connectToDatabase();
  const user: any = await User.findById(userId).select("resume").lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const convos = await Conversation.find({ participants: userId }).select("_id").lean();
  const convoIds = convos.map((c: any) => c._id);
  await Promise.all([
    Candidates.deleteMany({ candidateId: userId }),
    Notification.deleteMany({ userId }),
    InterviewPrep.deleteMany({ userId }),
    Message.deleteMany({ conversationId: { $in: convoIds } }),
    Conversation.deleteMany({ _id: { $in: convoIds } }),
    Contact.deleteMany({ userId }),
    ApplicationOutcome.deleteMany({ userId }),
    ApplicationEvent.deleteMany({ userId }),
    InterviewSession.deleteMany({ userId }),
    AutoApplication.deleteMany({ userId }),
    PracticeAttempt.deleteMany({ userId }),
    Referrer.deleteMany({ userId }),
    ReferralRequest.deleteMany({ candidateId: userId }),
    MatchCache.deleteMany({ userId }),
    JobSignal.deleteMany({ userId }),
    ContactMessage.deleteMany({ userId }),
    UsageCounter.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
  await deleteResumeObject(String(user.resume || ""));

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: "token", value: "", path: "/", maxAge: 0 });
  return res;
}
