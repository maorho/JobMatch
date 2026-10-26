import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";
import { WebQuestionHarvest } from "@/app/models/WebInterviewQuestion";
import { harvestWebQuestions, ensureWebQuestions, webQuestionsDue, webQuestionsStatus, claimWebQuestionsHarvest } from "@/app/lib/interview/webQuestions";

setupTestDb();
beforeEach(async () => {
  await resetDb();
});

const throwingClient = {
  responses: {
    create: async () => {
      throw new Error("search down");
    },
  },
};

describe("web questions harvest attempts", () => {
  it("records a no-client attempt and backs off instead of staying due forever", async () => {
    expect(await webQuestionsDue("Initech")).toBe(true);
    expect(await ensureWebQuestions("Initech")).toBeNull(); // NODE_ENV=test → no research client
    const row: any = await WebQuestionHarvest.findOne({ companyKey: "initech" }).lean();
    expect(row).toMatchObject({ company: "Initech", error: "no research client", harvestStartedAt: null });
    expect(row.attemptedAt).toBeInstanceOf(Date);
    expect(row.harvestedAt).toBeUndefined();
    expect(await webQuestionsStatus("Initech")).toMatchObject({ backingOff: true, due: false });
  });

  it("records a thrown search, clears the in-flight marker, and backs off", async () => {
    expect(await ensureWebQuestions("Hooli", { client: throwingClient as any })).toBeNull();
    const row: any = await WebQuestionHarvest.findOne({ companyKey: "hooli" }).lean();
    expect(row.error).toMatch(/search failed: search down/);
    expect(row.harvestStartedAt).toBeNull();
    expect(await webQuestionsDue("Hooli")).toBe(false);
    // The back-off also stops a direct call from paying for another search.
    let calls = 0;
    const counting = { responses: { create: async () => (calls++, { output_text: "{}", output: [] }) } };
    expect(await harvestWebQuestions("Hooli", { client: counting as any })).toBeNull();
    expect(calls).toBe(0);
  });

  it("only one caller can claim a harvest while it is in flight", async () => {
    expect(await claimWebQuestionsHarvest("Pied Piper")).toBe(true);
    expect(await claimWebQuestionsHarvest("Pied Piper")).toBe(false);
    expect(await webQuestionsStatus("Pied Piper")).toMatchObject({ inFlight: true, due: false });
    // Another (unclaimed) caller skips the search entirely.
    let calls = 0;
    const counting = { responses: { create: async () => (calls++, { output_text: "{}", output: [] }) } };
    expect(await harvestWebQuestions("Pied Piper", { client: counting as any })).toBeNull();
    expect(calls).toBe(0);
    // An expired marker can be claimed again.
    const key = ((await WebQuestionHarvest.findOne({}).lean()) as any).companyKey;
    await WebQuestionHarvest.updateOne({ companyKey: key }, { $set: { harvestStartedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await claimWebQuestionsHarvest("Pied Piper")).toBe(true);
  });
});
