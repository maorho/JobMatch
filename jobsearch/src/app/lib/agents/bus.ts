import mongoose from "mongoose";
import { after } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import AgentMessage from "@/app/models/AgentMessage";
import AgentRun from "@/app/models/AgentRun";
import { getAgent, ownerOf } from "./registry";
import { priorityOf, type AgentContext, type BusMessage, type MessageType, type Payloads, type Sender } from "./types";

/**
 * The agent bus. Agents never call each other directly: they post messages
 * here, the dispatcher hands each message to the agent that owns its type,
 * and whatever that agent sends in response goes back on the queue. Every
 * message is persisted, so a run can be read back as a conversation and a
 * crashed process just resumes from the queue.
 */
const MAX_ATTEMPTS = 3;
/**
 * Lease: a "processing" message whose `startedAt` is older than this is
 * considered abandoned and reclaimed. Long handlers renew it via
 * `ctx.heartbeat()` (which bumps `startedAt`), so the worker and the cron
 * tick never double-process a message that is merely slow.
 */
const STUCK_AFTER_MS = 10 * 60 * 1000;
const staleBefore = () => new Date(Date.now() - STUCK_AFTER_MS);

export type SendInput<T extends MessageType> = {
  runId: string;
  from: Sender;
  type: T;
  payload: Payloads[T];
  says?: string;
  replyTo?: string;
  parentId?: string;
};

/** Open a new run (conversation) and return its id. */
export async function startRun(flow: string, opts: { title?: string; startedBy?: string } = {}): Promise<string> {
  await connectToDatabase();
  const run = await AgentRun.create({ flow, title: opts.title || flow, startedBy: opts.startedBy || "system" });
  return String(run._id);
}

/** Post a message; it is handled on the next `processQueue`. */
export async function send<T extends MessageType>(input: SendInput<T>): Promise<string> {
  await connectToDatabase();
  const doc = await AgentMessage.create({
    runId: input.runId,
    from: input.from,
    to: ownerOf(input.type),
    type: input.type,
    payload: input.payload,
    says: input.says || "",
    replyTo: input.replyTo,
    parentId: input.parentId,
    priority: priorityOf(input.type), // harmless until the schema carries the field (then claims sort by it)
  });
  await AgentRun.updateOne({ _id: input.runId }, { $inc: { "stats.messages": 1 }, $set: { status: "running" }, $unset: { finishedAt: 1 } });
  return String(doc._id);
}

/** Start a run with its first message in one go. */
export async function startFlow<T extends MessageType>(
  type: T,
  payload: Payloads[T],
  opts: { from?: Sender; says?: string; title?: string; startedBy?: string } = {}
): Promise<{ runId: string; messageId: string }> {
  const runId = await startRun(type, { title: opts.title, startedBy: opts.startedBy });
  const messageId = await send({ runId, from: opts.from || "system", type, payload, says: opts.says });
  return { runId, messageId };
}

/** `failed` counts distinct messages that failed at least once in this pass, not attempts. */
export type ProcessResult = { handled: number; failed: number; remaining: number };

/**
 * Drain the queue — user-triggered work first, then oldest first — until it
 * is empty or `budgetMs` is spent. Safe to run from several processes: a
 * message is claimed atomically and leased (see STUCK_AFTER_MS).
 */
export async function processQueue(opts: { budgetMs?: number; max?: number; runId?: string; skipTypes?: MessageType[] } = {}): Promise<ProcessResult> {
  await connectToDatabase();
  const budgetMs = opts.budgetMs ?? 60_000;
  const max = opts.max ?? 200;
  const deadline = Date.now() + budgetMs;
  const result: ProcessResult = { handled: 0, failed: 0, remaining: 0 };
  const failedIds = new Set<string>();
  const touchedRuns = new Set<string>();
  const scope = opts.runId ? { runId: opts.runId } : {};
  // A runtime that cannot do some work (the worker without an apply server) leaves it queued for one that can.
  const typeScope = opts.skipTypes?.length ? { type: { $nin: opts.skipTypes } } : {};

  // Abandoned messages that already used every attempt are closed, not reclaimed forever.
  const exhausted: any[] = await AgentMessage.find({ ...scope, status: "processing", startedAt: { $lt: staleBefore() }, attempts: { $gte: MAX_ATTEMPTS } }).select("_id runId").lean();
  if (exhausted.length) {
    await AgentMessage.updateMany({ _id: { $in: exhausted.map((m) => m._id) } }, { $set: { status: "failed", error: "exceeded attempts after timeout", finishedAt: new Date() } });
    for (const m of exhausted) {
      touchedRuns.add(String(m.runId));
      await AgentRun.updateOne({ _id: m.runId }, { $inc: { "stats.failed": 1 } });
    }
  }

  let claims = 0;
  while (claims < max && Date.now() < deadline) {
    const claimed: any = await AgentMessage.findOneAndUpdate(
      {
        ...scope,
        ...typeScope,
        $or: [{ status: "queued" }, { status: "processing", startedAt: { $lt: staleBefore() }, attempts: { $lt: MAX_ATTEMPTS } }],
      },
      { $set: { status: "processing", startedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { priority: -1, createdAt: 1 }, new: true }
    ).lean();
    if (!claimed) break;
    claims++;

    const msg = toBusMessage(claimed);
    touchedRuns.add(msg.runId);
    const agent = getAgent(msg.to);
    const log: string[] = [];
    /**
     * The claim token: `attempts` as this claim set it. A reclaim (lease expired)
     * bumps it, so every write below filters on it — a superseded handler that
     * wakes up late can neither extend the new owner's lease nor overwrite its
     * verdict. Once a write matches nothing, this handler has lost the message.
     */
    const owned = { _id: claimed._id, status: "processing", attempts: msg.attempts };
    let lost = false;
    const loseOwnership = (where: string) => {
      if (!lost) console.warn(`[agents] ${msg.to} lost the lease on ${msg.type} ${msg._id} (attempt ${msg.attempts}) at ${where} — another dispatcher reclaimed it; this handler stops writing`);
      lost = true;
    };
    const guardedSend: typeof send = (input) => {
      // Stop a superseded handler from fanning out duplicates of what the new owner will send.
      if (lost) return Promise.reject(new Error(`lease lost on ${msg._id}: not sending ${input.type}`));
      return send(input);
    };
    const ctx: AgentContext = {
      send: (type, payload, says) => guardedSend({ runId: msg.runId, from: msg.to, type, payload, says, parentId: msg._id }),
      reply: (type, payload, says) => guardedSend({ runId: msg.runId, from: msg.to, type, payload, says, parentId: msg._id, replyTo: msg._id }),
      log: (line) => log.push(line),
      heartbeat: async () => {
        if (lost) return;
        const r = await AgentMessage.updateOne(owned, { $set: { startedAt: new Date() } });
        if (r.matchedCount === 0) loseOwnership("heartbeat");
      },
      deadline,
    };

    try {
      if (!agent) throw new Error(`No agent registered for "${msg.to}"`);
      if (!agent.handles.includes(msg.type)) throw new Error(`Agent "${agent.name}" does not handle "${msg.type}"`);
      const said = (await agent.handle(msg, ctx)) || "";
      const done = lost
        ? { matchedCount: 0 }
        : await AgentMessage.updateOne(owned, { $set: { status: "done", result: [said, ...log].filter(Boolean).join("\n").slice(0, 2000), error: "", finishedAt: new Date() } });
      if (done.matchedCount === 0) {
        loseOwnership("completion");
      } else {
        await AgentRun.updateOne({ _id: msg.runId }, { $inc: { "stats.done": 1 } });
        result.handled++;
      }
    } catch (err: any) {
      const message = String(err?.message || err).slice(0, 1000);
      const giveUp = msg.attempts >= MAX_ATTEMPTS;
      const failed = lost
        ? { matchedCount: 0 }
        : await AgentMessage.updateOne(owned, { $set: { status: giveUp ? "failed" : "queued", error: message, result: log.join("\n").slice(0, 2000), finishedAt: giveUp ? new Date() : undefined } });
      if (failed.matchedCount === 0) {
        loseOwnership("failure");
        console.error(`[agents] ${msg.to} (superseded) failed on ${msg.type} (attempt ${msg.attempts}):`, message);
      } else {
        if (giveUp) await AgentRun.updateOne({ _id: msg.runId }, { $inc: { "stats.failed": 1 } });
        failedIds.add(msg._id);
        console.error(`[agents] ${msg.to} failed on ${msg.type} (attempt ${msg.attempts}):`, message);
      }
    }
  }

  result.failed = failedIds.size;
  for (const runId of touchedRuns) await settleRun(runId);
  // Skipped types don't count: a worker that leaves them for another runtime must still go idle.
  result.remaining = await AgentMessage.countDocuments({ status: "queued", ...scope, ...typeScope });
  return result;
}

/** Close a run once nothing in it is pending. */
async function settleRun(runId: string) {
  const pending = await AgentMessage.countDocuments({ runId, status: { $in: ["queued", "processing"] } });
  if (pending > 0) return;
  const failed = await AgentMessage.countDocuments({ runId, status: "failed" });
  await AgentRun.updateOne({ _id: runId }, { $set: { status: failed ? "failed" : "done", finishedAt: new Date() } });
}

function toBusMessage(doc: any): BusMessage {
  return {
    _id: String(doc._id),
    runId: String(doc.runId),
    from: doc.from,
    to: doc.to,
    type: doc.type,
    payload: doc.payload || {},
    says: doc.says || "",
    replyTo: doc.replyTo ? String(doc.replyTo) : undefined,
    parentId: doc.parentId ? String(doc.parentId) : undefined,
    attempts: doc.attempts || 0,
  };
}

/**
 * Best-effort nudge after a user action: drain THAT run right away so the
 * user sees the agents react, without blocking the response and without a
 * request handler picking up unrelated cron work (the scout chunks belong to
 * the worker / tick). Off in tests (they drive the bus explicitly) and when
 * AGENTS_INLINE=0.
 */
export function kick(runId: string, opts: { budgetMs?: number } = {}): void {
  if (process.env.NODE_ENV === "test" || process.env.AGENTS_INLINE === "0") return;
  if (!runId) return;
  const run = () => processQueue({ runId, budgetMs: opts.budgetMs ?? 8_000, max: 20 }).catch((e) => console.error("[agents] kick failed:", e?.message));
  try {
    // Next's `after` keeps the function alive past the response on serverless;
    // it throws outside a request scope, in which case we just run inline.
    after(run);
  } catch {
    void run();
  }
}

/** Read one run as a conversation (messages in order). */
export async function readRun(runId: string) {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(runId)) return null;
  const run: any = await AgentRun.findById(runId).lean();
  if (!run) return null;
  const messages: any[] = await AgentMessage.find({ runId }).sort({ createdAt: 1 }).lean();
  return { run, messages };
}
