import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
vi.mock("@/app/lib/apply/submit", async (importOriginal) => ({ ...(await importOriginal<any>()), submitExternalApplication: vi.fn(async (input: any) => (input.dryRun ? { status: "ready", ats: "greenhouse", fields: [] } : { status: "submitted", ats: "greenhouse", confirmation: "Thanks" })) }));
vi.mock("@/app/lib/resume/tailor", async (importOriginal) => ({ ...(await importOriginal<any>()), tailorResumeToJob: vi.fn(async (i: any) => ({ tailoredResume: i.resumeStructured, fitScore: 80, matchedSkills: [], missingSkills: [], keywordGaps: [], suggestions: [], changes: [] })) }));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { signJwt } from "@/app/lib/jwt";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { generateApiKey, hashApiKey, userIdFromApiKey } from "@/app/lib/auth/apiKey";
import { handleMcp, TOOLS } from "@/app/lib/mcp/server";
import { POST as mcpPOST, GET as mcpGET } from "@/app/api/mcp/route";
import { GET as keyGET, POST as keyPOST, DELETE as keyDELETE } from "@/app/api/settings/api-key/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const rpc = (method: string, params?: any, id: number | undefined = 1) => ({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) });
const call = async (body: unknown, headers: Record<string, string> = {}) => { const r = await mcpPOST(new NextRequest(`${O}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };
const RESUME = [{ heading: "Header", items: [{ title: "Dana Cohen", contact: ["dana@test.dev"], summary: "Junior React developer" }] }, { heading: "Experience", items: [{ title: "Frontend Developer", subtitle: "Acme", dateRange: "2024 – Present", bullets: ["React"] }] }];
let dana = "", apiKey = "", reactJob = "", goJob = "";

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Cohen", phone: "050", resumeStructured: RESUME, resumeUpdatedAt: new Date(), autoApply: { enabled: false, minScore: 75, dailyCap: 3 } } as any))._id);
  await embedAndStoreResume(dana, "Junior React developer, TypeScript, Next.js");
  const jobs = await ExternalJobs.create([
    { job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://boards.greenhouse.io/acme/jobs/1", finalUrl: "https://boards.greenhouse.io/acme/jobs/1", description: "React TypeScript Next.js junior frontend", skills: ["React"], seniority: [], source: "greenhouse", sourceJobId: "r1", postedAt: new Date() },
    { job: "Go Backend Engineer", company: "Globex", city: "Haifa", country: "Israel", url: "u2", finalUrl: "u2", description: "Go Kubernetes Kafka backend", skills: [], seniority: [], source: "greenhouse", sourceJobId: "g1", postedAt: new Date() },
  ] as any);
  [reactJob, goJob] = jobs.map((j: any) => String(j._id));
  await embedPendingJobs(10);
});

describe("API keys", () => {
  it("issues a key once, resolves it to the user, and revokes it", async () => {
    const k = generateApiKey();
    expect(k).toMatch(/^jm_live_[A-Za-z0-9]{40}$/);
    expect(hashApiKey(k)).toHaveLength(64);
    expect((await keyGET(new NextRequest(`${O}/api/settings/api-key`))).status).toBe(401);
    const issued = await (await keyPOST(new NextRequest(`${O}/api/settings/api-key`, { method: "POST", headers: await cookie(dana) }))).json();
    apiKey = issued.key;
    expect(issued.endpoint).toMatch(/\/api\/mcp$/);
    const st = await (await keyGET(new NextRequest(`${O}/api/settings/api-key`, { headers: await cookie(dana) }))).json();
    expect(st).toMatchObject({ hasKey: true, prefix: apiKey.slice(0, 12) + "…" });
    expect(await userIdFromApiKey(`Bearer ${apiKey}`)).toBe(dana);
    expect(await userIdFromApiKey("Bearer jm_live_nope")).toBeNull();
    expect(await userIdFromApiKey(undefined)).toBeNull();
    // The hash never leaks through the default projection.
    expect(((await User.findById(dana).lean()) as any).apiKeyHash).toBeUndefined();
  });
});

describe("MCP server", () => {
  it("speaks JSON-RPC: initialize, tools/list, ping, notifications, unknown methods", async () => {
    const init = await call(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }));
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("jobmatch");
    expect(init.body.result.instructions).toMatch(/anonymous/);
    const list = await call(rpc("tools/list"));
    expect(list.body.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect((await call(rpc("ping"))).body.result).toEqual({});
    expect((await call(rpc("notifications/initialized", undefined, undefined))).status).toBe(202); // notification → no body
    expect((await call(rpc("nope"))).body.error.code).toBe(-32601);
    expect((await call({ not: "jsonrpc" })).body.error.code).toBe(-32600);
    expect((await mcpGET()).status).toBe(405);
    const batch = await call([rpc("ping", undefined, 1), rpc("ping", undefined, 2)]);
    expect(batch.body).toHaveLength(2);
  });

  it("serves the public catalog tools without a key", async () => {
    const s = await call(rpc("tools/call", { name: "search_jobs", arguments: { query: "react developer", limit: 5 } }));
    expect(s.body.result.structuredContent.jobs[0].title).toBe("Junior React Developer");
    expect(s.body.result.structuredContent.jobs[0].url).toMatch(new RegExp(`/job/external/${reactJob}$`));
    const g = await call(rpc("tools/call", { name: "get_job", arguments: { id: reactJob } }));
    expect(g.body.result.structuredContent.description).toMatch(/React TypeScript/);
    const sim = await call(rpc("tools/call", { name: "similar_jobs", arguments: { id: reactJob, limit: 3 } }));
    expect(sim.body.result.structuredContent.jobs.map((j: any) => j.id)).not.toContain(reactJob);
    expect((await call(rpc("tools/call", { name: "get_job", arguments: { id: "000000000000000000000000" } }))).body.result.content[0].text).toMatch(/not found/i);
  });

  it("refuses personal tools without a key and serves them with one (cookie works too)", async () => {
    const anon = await call(rpc("tools/call", { name: "my_matches", arguments: {} }));
    expect(anon.body.result.isError).toBe(true);
    expect(anon.body.result.content[0].text).toMatch(/API key/);
    const mine = await call(rpc("tools/call", { name: "my_matches", arguments: { limit: 5 } }), { Authorization: `Bearer ${apiKey}` });
    expect(mine.body.result.structuredContent.level).toBe("junior");
    expect(mine.body.result.structuredContent.jobs[0].title).toBe("Junior React Developer");
    expect(mine.body.result.structuredContent.jobs[0].fit).toBeGreaterThan(mine.body.result.structuredContent.jobs[1].fit);
    const viaCookie = await call(rpc("tools/call", { name: "my_applications", arguments: {} }), await cookie(dana));
    expect(viaCookie.body.result.structuredContent.applications).toEqual([]);
    const prep = await call(rpc("tools/call", { name: "who_do_i_know", arguments: { company: "Acme" } }), { Authorization: `Bearer ${apiKey}` });
    expect(prep.body.result.structuredContent.count).toBe(0);
  });

  it("applies on an explicit request even with auto-apply off (dedupe and cap still hold)", async () => {
    const a = await call(rpc("tools/call", { name: "apply_to_job", arguments: { id: reactJob } }), { Authorization: `Bearer ${apiKey}` });
    expect(a.body.result.structuredContent.status).toBe("submitted");
    expect(await Candidates.countDocuments({ candidateId: dana, jobId: reactJob })).toBe(1);
    const again = await call(rpc("tools/call", { name: "apply_to_job", arguments: { id: reactJob } }), { Authorization: `Bearer ${apiKey}` });
    expect(again.body.result.content[0].text).toMatch(/Already applied/);
    const apps = await call(rpc("tools/call", { name: "my_applications", arguments: {} }), { Authorization: `Bearer ${apiKey}` });
    expect(apps.body.result.structuredContent.applications[0]).toMatchObject({ jobId: reactJob, status: "Submitted Resume", company: "Acme" });
  });

  it("a revoked key stops working", async () => {
    await keyDELETE(new NextRequest(`${O}/api/settings/api-key`, { method: "DELETE", headers: await cookie(dana) }));
    expect(await userIdFromApiKey(`Bearer ${apiKey}`)).toBeNull();
    const after = await call(rpc("tools/call", { name: "my_matches", arguments: {} }), { Authorization: `Bearer ${apiKey}` });
    expect(after.body.result.isError).toBe(true);
    expect(await handleMcp(rpc("ping"), { userId: null })).toMatchObject({ result: {} });
  });
});
