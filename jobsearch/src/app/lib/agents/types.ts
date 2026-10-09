/**
 * The vocabulary the agents share. Every message on the bus has one of these
 * types and the payload shape listed next to it. Keep this file the single
 * source of truth when adding an agent or a new kind of message.
 */
export const AGENT_NAMES = ["scout", "locator", "matcher", "notifier", "tracker", "coach", "janitor", "applier", "writer"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** Non-agent senders. */
export type Sender = AgentName | "system" | "cron" | "admin" | "user" | "resumeai";

/** One application moving to a new status (what the Tracker reports). */
export type ApplicationChange = { userId: string; applicationId: string; jobId: string; jobModel: string; status: string; title: string; company: string };

export type Payloads = {
  /** Scout: poll the catalog sources (chunked; `offset`/`acc` continue a run). */
  "catalog.refresh": { offset?: number; since: string; company?: string; acc?: { created: number; removed: number; sources: number } };
  /** Tracker: read one user's inbox and report application status changes. */
  "inbox.sync": { userId: string };
  /** Scout → Locator: new postings landed since `since`. */
  "jobs.ingested": { since: string; created: number; removed: number; sources: number };
  /** Locator → Matcher: locations are clean, go embed. */
  "jobs.normalized": { since: string; updatedDocs: number; unresolved: number };
  /** Matcher → Notifier: new postings have vectors, tell people. */
  "jobs.embedded": { since: string; embedded: number; remaining: number };
  /** ResumeAI → Matcher: a user's résumé changed. */
  "resume.updated": { userId: string };
  /** Matcher → Notifier: a user's fresh top matches. */
  "candidate.matched": { userId: string; top: { jobId: string; title: string; company: string; score: number }[] };
  /** Tracker → Coach: an application moved to a new status. */
  "application.changed": ApplicationChange;
  /** Coach → Matcher: how well does this user fit this job? (`context` rides along so the coach stays stateless.) */
  "fit.request": { userId: string; jobId: string; jobModel: string; context: ApplicationChange };
  /** Matcher → Coach: the answer, with the coach's context echoed back. */
  "fit.reply": { userId: string; jobId: string; jobModel: string; score: number | null; context: ApplicationChange };
  /** Coach → Notifier: a plan for the next stage is ready. */
  "prep.ready": { userId: string; jobId: string; source: "internal" | "external"; stage: string; status: string; title: string; company: string; score: number | null; generated: boolean };
  /** Janitor: delete postings no source has reported for a while. */
  "catalog.sweep": { staleDays?: number };
  /** Matcher → Applier: postings that cleared the user's auto-apply bar. */
  "apply.request": { userId: string; jobs: { jobId: string; jobModel: "Job" | "ExternalJobs"; score: number; title: string; company: string }[]; trigger: "new_postings" | "resume_updated" | "manual" };
  /** Writer: pick `count` timely topics and write them. */
  "content.plan": { count: number; publish?: boolean };
  /** Writer: write one article. */
  "content.request": { topic: string; angle?: string; audience?: string; publish?: boolean };
  /** Writer → Notifier: an article is drafted/published. */
  "content.ready": { articleId: string; slug: string; title: string; status: "draft" | "published"; words: number };
  /** Applier → Notifier: what happened with the auto-applications. */
  "apply.report": { userId: string; submitted: { jobId: string; title: string; company: string; score: number }[]; needsUser: { jobId: string; title: string; company: string; reason: string }[]; failed: number; capped: number };
};
export type MessageType = keyof Payloads;

/** Who handles what. The bus routes by this table, so a message type has exactly one owner. */
export const ROUTES: Record<MessageType, AgentName> = {
  "catalog.refresh": "scout",
  "inbox.sync": "tracker",
  "jobs.ingested": "locator",
  "jobs.normalized": "matcher",
  "jobs.embedded": "notifier",
  "resume.updated": "matcher",
  "candidate.matched": "notifier",
  "application.changed": "coach",
  "fit.request": "matcher",
  "fit.reply": "coach",
  "prep.ready": "notifier",
  "catalog.sweep": "janitor",
  "apply.request": "applier",
  "apply.report": "notifier",
  "content.plan": "writer",
  "content.request": "writer",
  "content.ready": "notifier",
};

export type BusMessage<T extends MessageType = MessageType> = {
  _id: string;
  runId: string;
  from: Sender;
  to: AgentName;
  type: T;
  payload: Payloads[T];
  says: string;
  replyTo?: string;
  parentId?: string;
  attempts: number;
};

export type AgentContext = {
  /** Send a message to the agent that owns `type` (same run, parented to the current message). */
  send<T extends MessageType>(type: T, payload: Payloads[T], says?: string): Promise<string>;
  /** Answer the sender of the current message. */
  reply<T extends MessageType>(type: T, payload: Payloads[T], says?: string): Promise<string>;
  /** Append a line to the current message's log (visible in the conversation view). */
  log(line: string): void;
};

export type AgentDef = {
  name: AgentName;
  title: string;
  description: string;
  handles: MessageType[];
  /** Return the line this agent "says" after handling the message. */
  handle: (msg: BusMessage, ctx: AgentContext) => Promise<string | void>;
};
