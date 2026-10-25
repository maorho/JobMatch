import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, resetDb } from "../setup/mongo";
import { dedupeCandidates } from "@/app/lib/ops/dedupeCandidates";

// Raw collections only: the duplicates under test could never be inserted
// through the Candidate model once its unique index exists.
setupTestDb();

const oid = () => new mongoose.Types.ObjectId();
const db = () => mongoose.connection.db!;
const day = (n: number) => new Date(Date.UTC(2026, 0, n));

beforeEach(async () => {
  await resetDb();
});

describe("dedupe-candidates", () => {
  it("keeps the furthest status, re-points references to it, and deletes the rest", async () => {
    const user = oid(), job = oid();
    const oldest = oid(), furthest = oid(), third = oid();
    await db().collection("candidates").insertMany([
      { _id: oldest, candidateId: user, jobId: job, jobModel: "ExternalJobs", status: "Submitted Resume", createdAt: day(1) },
      { _id: furthest, candidateId: user, jobId: job, jobModel: "ExternalJobs", status: "Technical Interview", createdAt: day(3) },
      { _id: third, candidateId: user, jobId: job, jobModel: "ExternalJobs", status: "HR Phone Interview", createdAt: day(2) },
    ]);
    // The outcome hangs off the oldest row (the old script's keeper); the keeper has none.
    await db().collection("applicationoutcomes").insertOne({ userId: user, applicationId: oldest, outcome: "pending" });
    await db().collection("applicationevents").insertMany([
      { userId: user, applicationId: oldest, source: "email" },
      { userId: user, applicationId: third, source: "email" },
    ]);
    await db().collection("referralrequests").insertOne({ candidateId: user, jobId: job, applicationId: third });
    await db().collection("interviewquestions").insertMany([
      { userId: user, applicationId: furthest, key: "q1" },
      { userId: user, applicationId: third, key: "q1" }, // same question as the keeper's → dropped
      { userId: user, applicationId: third, key: "q2" },
    ]);

    const dry = await dedupeCandidates(db(), { dry: true });
    expect(dry.plans).toEqual([{ candidateId: String(user), jobId: String(job), keep: String(furthest), drop: expect.arrayContaining([String(oldest), String(third)]) }]);
    expect(await db().collection("candidates").countDocuments()).toBe(3); // dry changes nothing

    const r = await dedupeCandidates(db());
    expect(r).toMatchObject({ groups: 1, deleted: 2, outcomesRepointed: 1, eventsRepointed: 2, referralsRepointed: 1, questionsRepointed: 1, questionsDeleted: 1 });
    expect((await db().collection("candidates").find().toArray()).map((c) => String(c._id))).toEqual([String(furthest)]);
    expect((await db().collection("applicationoutcomes").findOne())!.applicationId).toEqual(furthest);
    expect(await db().collection("applicationevents").countDocuments({ applicationId: furthest })).toBe(2);
    expect((await db().collection("referralrequests").findOne())!.applicationId).toEqual(furthest);
    expect((await db().collection("interviewquestions").find({}, { sort: { key: 1 } }).toArray()).map((q) => [String(q.applicationId), q.key])).toEqual([
      [String(furthest), "q1"],
      [String(furthest), "q2"],
    ]);

    // Idempotent.
    expect(await dedupeCandidates(db())).toMatchObject({ groups: 0, deleted: 0 });
  });

  it("status tie → the row with an outcome, and a duplicate outcome is deleted rather than re-pointed", async () => {
    const user = oid(), job = oid();
    const a = oid(), b = oid();
    await db().collection("candidates").insertMany([
      { _id: a, candidateId: user, jobId: job, status: "Submitted Resume", createdAt: day(1) },
      { _id: b, candidateId: user, jobId: job, status: "Submitted Resume", createdAt: day(5) },
    ]);
    await db().collection("applicationoutcomes").insertOne({ userId: user, applicationId: b, outcome: "screen" });
    let r = await dedupeCandidates(db());
    expect(r.plans[0].keep).toBe(String(b));

    // Both have outcomes and equal status → oldest wins, the other outcome goes.
    await resetDb();
    await db().collection("candidates").insertMany([
      { _id: a, candidateId: user, jobId: job, status: "Rejected", createdAt: day(1) },
      { _id: b, candidateId: user, jobId: job, status: "Rejected" }, // legacy: no createdAt → ObjectId time (now)
    ]);
    await db().collection("applicationoutcomes").insertMany([
      { userId: user, applicationId: a, outcome: "rejected" },
      { userId: user, applicationId: b, outcome: "rejected" },
    ]);
    r = await dedupeCandidates(db());
    expect(r).toMatchObject({ outcomesDeleted: 1, outcomesRepointed: 0, deleted: 1 });
    expect(r.plans[0].keep).toBe(String(a));
    expect(await db().collection("applicationoutcomes").countDocuments({ applicationId: a })).toBe(1);
    expect(await db().collection("applicationoutcomes").countDocuments()).toBe(1);
  });
});
