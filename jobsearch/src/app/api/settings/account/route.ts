import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import InterviewPrep from "@/app/models/InterviewPrep";
import Conversation from "@/app/models/Conversation";
import Message from "@/app/models/Message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/settings/account { confirm: "DELETE" }
 * Deletes the account and the user's personal data (applications,
 * notifications, interview plans, messages). Jobs a recruiter published are
 * kept; their publisher reference is cleared.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: 'Send { "confirm": "DELETE" }' }, { status: 400 });

  await connectToDatabase();
  const convos = await Conversation.find({ participants: userId }).select("_id").lean();
  const convoIds = convos.map((c: any) => c._id);
  await Promise.all([
    Candidates.deleteMany({ candidateId: userId }),
    Notification.deleteMany({ userId }),
    InterviewPrep.deleteMany({ userId }),
    Message.deleteMany({ conversationId: { $in: convoIds } }),
    Conversation.deleteMany({ _id: { $in: convoIds } }),
  ]);
  await User.deleteOne({ _id: userId });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: "token", value: "", path: "/", maxAge: 0 });
  return res;
}
