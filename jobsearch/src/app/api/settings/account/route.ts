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
import ReferralRequest, { OPEN_STATUSES } from "@/app/models/ReferralRequest";
import AddedJobs from "@/app/models/AddedJobs";
import InterviewQuestion from "@/app/models/InterviewQuestion";
import mongoose from "mongoose";
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
 * Interview questions the person reported. Private (non-shareable) ones are
 * deleted. Shareable ones feed the public per-company question bank, so they
 * are kept but cut loose from the person: the personal note and application
 * link are dropped, and userId is swapped for ONE fresh anonymous id rather
 * than $unset — userId is required, the bank counts distinct reporters by it,
 * and the unique (userId, applicationId, key) index would make unset rows
 * collide. A row that still collides (same question reported for two
 * applications) is a duplicate and is deleted.
 */
async function anonymizeInterviewQuestions(userId: string): Promise<void> {
  await InterviewQuestion.deleteMany({ userId, shareable: { $ne: true } });
  const rows = await InterviewQuestion.find({ userId }).select("_id").lean();
  const anon = new mongoose.Types.ObjectId();
  for (const r of rows as any[]) {
    try {
      await InterviewQuestion.updateOne({ _id: r._id }, { $set: { userId: anon, note: "" }, $unset: { applicationId: 1 } });
    } catch (e: any) {
      if (e?.code === 11000) await InterviewQuestion.deleteOne({ _id: r._id });
      else throw e;
    }
  }
}

/**
 * DELETE /api/settings/account { confirm: "DELETE" }
 * Deletes the account and every row keyed to the person: applications and
 * their outcomes/events, notifications, interview plans and sessions,
 * practice, messages, contacts, referrals (as insider and as requester; open
 * requests sent to them as an insider are expired), manually added jobs,
 * private interview questions (shareable ones are anonymized), match caches,
 * signals, usage counters, and the résumé file in S3. Jobs a recruiter
 * published are kept. Deleting the User row also revokes every session
 * (getUserIdFromRequest requires the user to exist).
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
    // Requests other candidates sent to this person as an insider: their
    // history is theirs, so expire the open ones ("expired" is outside
    // OPEN_STATUSES, so the candidates' open-request counts drop) instead of deleting.
    ReferralRequest.updateMany({ referrerUserId: userId, status: { $in: OPEN_STATUSES } }, { $set: { status: "expired", respondedAt: new Date() } }),
    AddedJobs.deleteMany({ candidateId: userId }),
    anonymizeInterviewQuestions(userId),
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
