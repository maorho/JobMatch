import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import "@/app/models/Job";
import "@/app/models/AddedJobs";
import AutoApplication from "@/app/models/AutoApplication";
import { textSearch, vectorSearch } from "@/app/lib/matcher/atlas";
import { rankForUser, loadCandidateProfile } from "@/app/lib/matcher/hybrid";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { autoApplyForUser } from "@/app/lib/apply/autoApply";
import { ensureInterviewPlan } from "@/app/lib/interview/ensurePlan";
import { contactsAtCompany } from "@/app/lib/contacts/linkedin";
import { siteUrl } from "@/app/lib/seo/site";

/**
 * JobMatch as an MCP server (Model Context Protocol, Streamable HTTP, stateless
 * JSON responses). Any MCP client — Claude, ChatGPT, Cursor — can search the
 * catalog, read a posting, get the user's personal matches, apply, and start
 * interview prep, authenticated with the user's personal API key.
 *
 * Implements the JSON-RPC methods a client needs (initialize, ping,
 * tools/list, tools/call, notifications) without the SDK, so it runs inside
 * a Next route handler and is fully unit-testable.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "jobmatch", version: "1.0.0" };

type JsonRpcId = string | number | null;
export type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: any };
export type JsonRpcResponse = { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export type ToolContext = { userId: string | null };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresAuth?: boolean;
  run: (args: any, ctx: ToolContext) => Promise<unknown>;
};

const text = (s: string) => ({ content: [{ type: "text", text: s }] });
const json = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }], structuredContent: o });
const jobUrl = (id: string, source = "external") => `${siteUrl()}/job/${source}/${id}`;

const brief = (j: any) => ({ id: String(j._id), title: j.job, company: j.company, location: [j.city, j.country].filter((v) => v && v !== "Unknown").join(", ") || (j.remote ? "Remote" : ""), remote: !!j.remote, postedAt: j.postedAt, url: jobUrl(String(j._id)), applyUrl: j.finalUrl || j.url });

export const TOOLS: Tool[] = [
  {
    name: "search_jobs",
    description: "Search JobMatch's live catalog of tech jobs in Israel (4,000+ postings refreshed daily). Returns the most relevant postings for a free-text query, optionally filtered by company, city or country. Public.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "e.g. 'junior react developer'" }, company: { type: "string" }, city: { type: "string" }, country: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } }, required: ["query"] },
    async run(args) {
      await connectToDatabase();
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const filter = { company: args.company ? [String(args.company)] : undefined, city: args.city ? [String(args.city)] : undefined, country: args.country ? [String(args.country)] : undefined };
      const hits = await textSearch(String(args.query || ""), { limit: limit * 3, filter });
      const docs: any[] = await ExternalJobs.find({ _id: { $in: hits.map((h) => h._id) } }).select("job company city country remote postedAt finalUrl url").lean();
      const pos = new Map(hits.map((h, i) => [h._id, i]));
      const jobs = docs.sort((a, b) => (pos.get(String(a._id)) ?? 0) - (pos.get(String(b._id)) ?? 0)).slice(0, limit).map(brief);
      return json({ query: args.query, count: jobs.length, jobs });
    },
  },
  {
    name: "get_job",
    description: "Full details of one posting (description, skills, location, apply link). Public.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    async run(args) {
      const job = await loadJob("external", String(args.id || ""));
      if (!job) return text("Job not found.");
      return json({ ...brief(job), description: (job.description || "").slice(0, 6000), skills: job.skills || [], seniority: job.seniority || [] });
    },
  },
  {
    name: "my_matches",
    description: "The signed-in candidate's best-matching postings, ranked against their résumé (fit 0–100 with a one-line reason). Requires the user's JobMatch API key.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30, default: 10 }, query: { type: "string", description: "optional focus, e.g. 'remote backend'" } } },
    requiresAuth: true,
    async run(args, ctx) {
      const { jobs, profile } = await rankForUser(ctx.userId!, { limit: Math.min(Math.max(Number(args.limit) || 10, 1), 30), query: args.query ? String(args.query) : undefined, rerank: true });
      if (!profile?.vector) return text("No résumé on file yet — upload one at " + siteUrl() + "/ResumeAI first.");
      return json({ level: profile.level, count: jobs.length, jobs: jobs.map((j) => ({ ...brief(j), fit: j.matchScore, why: j.why || "", gaps: j.gaps || [] })) });
    },
  },
  {
    name: "similar_jobs",
    description: "Postings similar to a given posting (semantic neighbours). Public.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, limit: { type: "integer", default: 8 } }, required: ["id"] },
    async run(args) {
      await connectToDatabase();
      const j: any = await ExternalJobs.findById(String(args.id || "")).select("+embedding").lean().catch(() => null);
      if (!j?.embedding) return text("Job not found or not embedded yet.");
      const hits = (await vectorSearch(j.embedding, { limit: (Number(args.limit) || 8) + 1 })).filter((h) => h._id !== String(j._id));
      const docs: any[] = await ExternalJobs.find({ _id: { $in: hits.map((h) => h._id) } }).select("job company city country remote postedAt finalUrl url").lean();
      return json({ jobs: docs.map(brief) });
    },
  },
  {
    name: "apply_to_job",
    description: "Apply to a posting on the candidate's behalf: tailors their résumé to the posting, fills the ATS form with the Applier agent, and reports what happened (submitted / needs the candidate for specific questions / failed). Explicit request by the user, so it runs even when auto-apply is off; the daily cap still applies. Requires the API key.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    requiresAuth: true,
    async run(args, ctx) {
      const job = await loadJob("external", String(args.id || ""));
      if (!job) return text("Job not found.");
      const r = await autoApplyForUser(ctx.userId!, [{ jobId: String(job._id), jobModel: "ExternalJobs", score: 100, title: job.job, company: job.company }], { explicit: true });
      if (r.submitted.length) return json({ status: "submitted", job: brief(job) });
      if (r.needsUser.length) return json({ status: "needs_user", reason: r.needsUser[0].reason, applyUrl: job.finalUrl || job.url, job: brief(job) });
      if (r.capped) return text("Daily application cap reached — try again tomorrow or raise it in Settings.");
      if (r.skipped) return text("Already applied (or already handed to you) for this posting.");
      return text("Could not apply automatically — open " + (job.finalUrl || job.url) + " and apply manually.");
    },
  },
  {
    name: "interview_prep",
    description: "Build (or fetch) the candidate's interview preparation plan for a posting: stages, likely questions with how to answer, gaps to close, questions to ask. Requires the API key.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, language: { type: "string", enum: ["he", "en"], default: "he" } }, required: ["id"] },
    requiresAuth: true,
    async run(args, ctx) {
      const r = await ensureInterviewPlan({ userId: ctx.userId!, jobId: String(args.id || ""), source: "external", language: args.language === "en" ? "en" : "he" });
      if (!r) return text("Job not found.");
      return json({ job: r.job, cached: r.cached, practiceUrl: `${siteUrl()}/interview-prep/external/${args.id}`, plan: r.plan });
    },
  },
  {
    name: "who_do_i_know",
    description: "The candidate's LinkedIn connections at a company (imported in Settings), for referral requests. Requires the API key.",
    inputSchema: { type: "object", properties: { company: { type: "string" } }, required: ["company"] },
    requiresAuth: true,
    async run(args, ctx) {
      const contacts = await contactsAtCompany(ctx.userId!, String(args.company || ""), 12);
      return json({ company: args.company, count: contacts.length, contacts: contacts.map((c) => ({ name: c.fullName, position: c.position, linkedin: c.url })) });
    },
  },
  {
    name: "my_applications",
    description: "The candidate's applications and their current status. Requires the API key.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", default: 20 } } },
    requiresAuth: true,
    async run(args, ctx) {
      await connectToDatabase();
      // refPath populate resolves ExternalJobs / Job / AddedJobs alike; `job` or `title` depending on the model.
      const apps: any[] = await Candidates.find({ candidateId: ctx.userId }).sort({ updatedAt: -1 }).limit(Math.min(Number(args.limit) || 20, 100)).populate("jobId", "job title company").lean();
      // Postings the janitor has since pruned: fall back to the applier's own log for title/company.
      const gone = apps.filter((a) => !a.jobId || typeof a.jobId !== "object");
      const logs: any[] = gone.length ? await AutoApplication.find({ userId: ctx.userId, jobId: { $in: gone.map((a) => a.jobId) } }).select("jobId jobTitle company").lean() : [];
      const logOf = new Map(logs.map((l) => [String(l.jobId), l]));
      const profile = await loadCandidateProfile(ctx.userId!, { light: true });
      return json({
        level: profile?.level,
        applications: apps.map((a) => {
          const doc = a.jobId && typeof a.jobId === "object" ? a.jobId : null;
          const id = String(doc?._id ?? a.jobId);
          return { id: String(a._id), jobId: id, title: doc?.job || doc?.title || logOf.get(id)?.jobTitle || "", company: doc?.company || logOf.get(id)?.company || "", status: a.status, postingExpired: !doc, updatedAt: a.updatedAt };
        }),
      });
    },
  },
];

const err = (id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

/** Handle one JSON-RPC message (or a batch). Returns null for notifications. */
export async function handleMcp(message: unknown, ctx: ToolContext): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(message)) {
    const out = (await Promise.all(message.map((m) => handleMcp(m, ctx)))).filter(Boolean) as JsonRpcResponse[];
    return out.length ? out : null;
  }
  const req = message as JsonRpcRequest;
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") return err(null, -32600, "Invalid Request");
  const id = req.id ?? null;
  const isNotification = req.id === undefined;
  try {
    switch (req.method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: `JobMatch: live tech jobs in Israel with résumé matching, auto-apply and interview prep. Public tools: search_jobs, get_job, similar_jobs. Personal tools need the user's API key (Settings → סוכני AI חיצוניים): my_matches, apply_to_job, interview_prep, who_do_i_know, my_applications.${ctx.userId ? " This connection is authenticated." : " This connection is anonymous."}` } };
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } };
      case "tools/call": {
        const name = String(req.params?.name || "");
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) return err(id, -32602, `Unknown tool: ${name}`);
        if (tool.requiresAuth && !ctx.userId) return { jsonrpc: "2.0", id, result: { ...text(`The tool "${name}" needs the user's JobMatch API key. Ask them to create one in Settings → סוכני AI חיצוניים and configure it as the Authorization bearer token.`), isError: true } };
        try {
          return { jsonrpc: "2.0", id, result: await tool.run(req.params?.arguments || {}, ctx) };
        } catch (e: any) {
          return { jsonrpc: "2.0", id, result: { ...text(`Tool failed: ${e?.message || "unknown error"}`), isError: true } };
        }
      }
      case "resources/list":
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: req.method === "resources/list" ? { resources: [] } : { prompts: [] } };
      default:
        if (isNotification || req.method.startsWith("notifications/")) return null;
        return err(id, -32601, `Method not found: ${req.method}`);
    }
  } catch (e: any) {
    return err(id, -32603, e?.message || "Internal error");
  }
}
