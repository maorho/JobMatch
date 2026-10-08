import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Conversation from "@/app/models/Conversation";
import Message from "@/app/models/Message";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import User from "@/app/models/User";
import { notify } from "@/app/lib/notifications/notify";

export class MessagingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const oid = (s: string) => new mongoose.Types.ObjectId(s);
const pair = (a: string, b: string) => [a, b].sort().map(oid);
const pairKey = (a: string, b: string, jobId: string) => `${[a, b].sort().join(":")}:${jobId}`;

/**
 * Who may talk to whom: only around a job posted in the system.
 *  - anyone signed in may message the recruiter who published a job
 *  - the publisher may message a user who applied to that job
 */
export async function assertCanMessage(me: string, other: string, jobId: string): Promise<{ job: any }> {
  if (!mongoose.isValidObjectId(other) || !mongoose.isValidObjectId(jobId)) throw new MessagingError(400, "Invalid ids");
  if (me === other) throw new MessagingError(400, "Cannot message yourself");
  const job: any = await Job.findById(jobId).select("job publisher").lean();
  if (!job) throw new MessagingError(404, "Job not found");
  const publisher = job.publisher ? String(job.publisher) : "";
  if (!publisher) throw new MessagingError(403, "This job has no recruiter to contact");
  if (other === publisher) return { job };
  if (me === publisher) {
    const applied = await Candidates.exists({ jobId: job._id, candidateId: oid(other) });
    if (applied) return { job };
    throw new MessagingError(403, "You can only message candidates who applied to your job");
  }
  throw new MessagingError(403, "Messaging is only available with the job's recruiter");
}

/** Get or create the thread for (me, other, job). */
export async function openConversation(me: string, other: string, jobId: string) {
  await connectToDatabase();
  await assertCanMessage(me, other, jobId);
  const key = pairKey(me, other, jobId);
  const existing = await Conversation.findOne({ pairKey: key });
  if (existing) return existing;
  try {
    return await Conversation.create({ participants: pair(me, other), jobId: oid(jobId), pairKey: key, unread: {} });
  } catch (e: any) {
    // Lost a race with the other participant opening the same thread.
    if (e?.code === 11000) {
      const again = await Conversation.findOne({ pairKey: key });
      if (again) return again;
    }
    throw e;
  }
}

export async function sendMessage(me: string, conversationId: string, body: string) {
  await connectToDatabase();
  const text = (body || "").trim();
  if (!text) throw new MessagingError(400, "Empty message");
  if (text.length > 4000) throw new MessagingError(413, "Message too long");
  if (!mongoose.isValidObjectId(conversationId)) throw new MessagingError(400, "Invalid conversation");
  const convo: any = await Conversation.findById(conversationId);
  if (!convo) throw new MessagingError(404, "Conversation not found");
  const ids = convo.participants.map(String);
  if (!ids.includes(me)) throw new MessagingError(403, "Not a participant");
  const other = ids.find((id: string) => id !== me)!;

  const msg = await Message.create({ conversationId: convo._id, senderId: oid(me), body: text });
  convo.lastMessage = text.slice(0, 200);
  convo.lastMessageAt = msg.createdAt;
  convo.lastSenderId = oid(me);
  convo.unread.set(other, (convo.unread.get(other) || 0) + 1);
  await convo.save();

  const sender: any = await User.findById(me).select("fullname").lean();
  await notify(other, {
    type: "new_message",
    title: `הודעה חדשה מ-${sender?.fullname || "משתמש"}`,
    body: text.slice(0, 200),
    link: `/messages?c=${convo._id}`,
    meta: { conversationId: String(convo._id) },
  });
  return msg;
}

/** Messages of a thread (oldest first); opening it marks the other side's messages read. */
export async function readConversation(me: string, conversationId: string, limit = 200) {
  await connectToDatabase();
  if (!mongoose.isValidObjectId(conversationId)) throw new MessagingError(400, "Invalid conversation");
  const convo: any = await Conversation.findById(conversationId);
  if (!convo) throw new MessagingError(404, "Conversation not found");
  if (!convo.participants.map(String).includes(me)) throw new MessagingError(403, "Not a participant");

  await Message.updateMany({ conversationId: convo._id, senderId: { $ne: oid(me) }, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  if ((convo.unread.get(me) || 0) !== 0) {
    convo.unread.set(me, 0);
    await convo.save();
  }
  const messages = await Message.find({ conversationId: convo._id }).sort({ createdAt: 1, _id: 1 }).limit(limit).lean();
  return { conversation: convo, messages };
}

/** My threads, newest activity first, with the other participant and job attached. */
export async function listConversations(me: string, limit = 50) {
  await connectToDatabase();
  const convos: any[] = await Conversation.find({ participants: oid(me) })
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .populate({ path: "participants", select: "fullname avatar recruiter company" })
    .populate({ path: "jobId", select: "job" })
    .lean();
  let unreadTotal = 0;
  const items = convos.map((c) => {
    const other = (c.participants || []).find((p: any) => String(p._id) !== me) || null;
    const unread = Number(c.unread?.[me] ?? c.unread?.get?.(me) ?? 0);
    unreadTotal += unread;
    return {
      _id: String(c._id),
      other: other ? { _id: String(other._id), fullname: other.fullname, avatar: other.avatar || "", recruiter: !!other.recruiter, company: other.company || "" } : null,
      job: c.jobId ? { _id: String(c.jobId._id), title: c.jobId.job } : null,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      lastSenderId: c.lastSenderId ? String(c.lastSenderId) : null,
      unread,
    };
  });
  return { items, unreadTotal };
}
