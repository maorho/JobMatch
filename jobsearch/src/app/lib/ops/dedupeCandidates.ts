import mongoose from "mongoose";

type Db = mongoose.mongo.Db;
type Id = mongoose.Types.ObjectId;

/**
 * Collapse duplicate applications (same candidateId + jobId) so the unique
 * Candidates index can build — without losing pipeline progress or history.
 * Used by src/scripts/dedupe-candidates.ts; works on raw collections so it
 * runs before any schema/index is in place.
 *
 * Keeper per group: furthest status (same ranking as lib/outcomes) → the one
 * an ApplicationOutcome points at → oldest. References to the dropped rows are
 * re-pointed at the keeper first; where a unique index would collide (one
 * outcome per application, one question per application+key) the duplicate
 * reference row is deleted instead.
 */

// Mirrors STATUS_RANK in lib/outcomes/outcomes.ts (forward-only pipeline order).
export const STATUS_RANK: Record<string, number> = {
  "Submitted Resume": 0,
  Rejected: 1,
  "HR Phone Interview": 2,
  "Technical Interview": 3,
  "Final Interview": 4,
  "Recived an Offer": 5,
  Accepted: 6,
};

export type DedupeGroupPlan = { candidateId: string; jobId: string; keep: string; drop: string[] };
export type DedupeReport = {
  groups: number;
  rowsToDelete: number;
  plans: DedupeGroupPlan[];
  outcomesRepointed: number;
  outcomesDeleted: number;
  eventsRepointed: number;
  referralsRepointed: number;
  questionsRepointed: number;
  questionsDeleted: number;
  deleted: number;
};

type Row = { _id: Id; status?: string; createdAt?: Date };

const createdMs = (r: Row) => (r.createdAt instanceof Date ? r.createdAt.getTime() : r._id.getTimestamp().getTime());

export async function dedupeCandidates(db: Db, opts: { dry?: boolean } = {}): Promise<DedupeReport> {
  const candidates = db.collection("candidates");
  const outcomes = db.collection("applicationoutcomes");
  const events = db.collection("applicationevents");
  const referrals = db.collection("referralrequests");
  const questions = db.collection("interviewquestions");

  const groups = (await candidates
    .aggregate([
      { $group: { _id: { candidateId: "$candidateId", jobId: "$jobId" }, rows: { $push: { _id: "$_id", status: "$status", createdAt: "$createdAt" } }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray()) as { _id: { candidateId: unknown; jobId: unknown }; rows: Row[] }[];

  const report: DedupeReport = { groups: groups.length, rowsToDelete: 0, plans: [], outcomesRepointed: 0, outcomesDeleted: 0, eventsRepointed: 0, referralsRepointed: 0, questionsRepointed: 0, questionsDeleted: 0, deleted: 0 };
  if (!groups.length) return report;

  // Which rows have an outcome (needed for the tie-break), fetched once.
  const allIds = groups.flatMap((g) => g.rows.map((r) => r._id));
  const withOutcome = new Map<string, Id>(); // applicationId → outcome _id
  for (let i = 0; i < allIds.length; i += 1000) {
    const found = await outcomes.find({ applicationId: { $in: allIds.slice(i, i + 1000) } }, { projection: { applicationId: 1 } }).toArray();
    for (const o of found) withOutcome.set(String(o.applicationId), o._id as Id);
  }

  for (const g of groups) {
    const ranked = [...g.rows].sort(
      (a, b) =>
        (STATUS_RANK[b.status ?? ""] ?? 0) - (STATUS_RANK[a.status ?? ""] ?? 0) ||
        Number(withOutcome.has(String(b._id))) - Number(withOutcome.has(String(a._id))) ||
        createdMs(a) - createdMs(b) ||
        String(a._id).localeCompare(String(b._id))
    );
    const [keep, ...drop] = ranked;
    const dropIds = drop.map((r) => r._id);
    report.plans.push({ candidateId: String(g._id.candidateId), jobId: String(g._id.jobId), keep: String(keep._id), drop: dropIds.map(String) });
    report.rowsToDelete += dropIds.length;
    if (opts.dry) continue;

    // ApplicationOutcome: unique per application. Keeper's own outcome wins;
    // otherwise adopt the best-ranked dropped row's outcome; the rest go.
    const droppedOutcomes = drop.map((r) => withOutcome.get(String(r._id))).filter((x): x is Id => !!x);
    if (droppedOutcomes.length) {
      let toDelete = droppedOutcomes;
      if (!withOutcome.has(String(keep._id))) {
        const [adopt, ...rest] = droppedOutcomes;
        await outcomes.updateOne({ _id: adopt }, { $set: { applicationId: keep._id } });
        report.outcomesRepointed++;
        toDelete = rest;
      }
      if (toDelete.length) report.outcomesDeleted += (await outcomes.deleteMany({ _id: { $in: toDelete } })).deletedCount ?? 0;
    }

    // Timeline + referral rows: no uniqueness on applicationId, plain re-point.
    report.eventsRepointed += (await events.updateMany({ applicationId: { $in: dropIds } }, { $set: { applicationId: keep._id } })).modifiedCount;
    report.referralsRepointed += (await referrals.updateMany({ applicationId: { $in: dropIds } }, { $set: { applicationId: keep._id } })).modifiedCount;

    // Interview questions: unique (userId, applicationId, key) — the keeper may already hold the same question.
    const qs = await questions.find({ applicationId: { $in: dropIds } }, { projection: { userId: 1, key: 1 } }).toArray();
    for (const q of qs) {
      const clash = await questions.findOne({ userId: q.userId, applicationId: keep._id, key: q.key }, { projection: { _id: 1 } });
      if (clash) {
        await questions.deleteOne({ _id: q._id });
        report.questionsDeleted++;
        continue;
      }
      try {
        await questions.updateOne({ _id: q._id }, { $set: { applicationId: keep._id } });
        report.questionsRepointed++;
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
        await questions.deleteOne({ _id: q._id });
        report.questionsDeleted++;
      }
    }

    report.deleted += (await candidates.deleteMany({ _id: { $in: dropIds } })).deletedCount ?? 0;
  }
  return report;
}
