import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { setupTestDb } from "../setup/mongo";
import { ALL_MODELS } from "@/app/lib/allModels";
import { GET } from "@/app/api/scout/sync-indexes/route";

setupTestDb();

const MODELS_DIR = path.resolve(__dirname, "../../src/app/models");
const req = (secret?: string) => new NextRequest("http://localhost/api/scout/sync-indexes", { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

describe("sync-indexes", () => {
  it("registers every file under src/app/models (a forgotten model never gets its prod indexes)", async () => {
    const files = fs.readdirSync(MODELS_DIR).filter((f) => /\.ts$/.test(f)).map((f) => f.replace(/\.ts$/, ""));
    expect(Object.keys(ALL_MODELS).sort()).toEqual(files.sort());
    for (const f of files) {
      const mod = await import(/* @vite-ignore */ path.join(MODELS_DIR, `${f}.ts`));
      expect(mongoose.modelNames(), f).toContain(mod.default.modelName);
    }
  });

  it("is cron-guarded and syncs every model with a per-model report", async () => {
    expect((await GET(req())).status).toBeGreaterThanOrEqual(401);
    const res = await GET(req(process.env.CRON_SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((m: any) => m.model).sort()).toEqual(mongoose.modelNames().sort());
    expect(body.failed).toBe(0);
    const user = body.models.find((m: any) => m.model === "User");
    expect(user.indexes.length).toBeGreaterThan(1); // _id plus the unique email/username
  });

  it("one failing model doesn't abort the rest", async () => {
    const m = mongoose.model("OpsAlert");
    const orig = m.syncIndexes;
    (m as any).syncIndexes = async () => {
      throw new Error("boom");
    };
    try {
      const body = await (await GET(req(process.env.CRON_SECRET))).json();
      expect(body.models.find((r: any) => r.model === "OpsAlert")).toEqual({ model: "OpsAlert", ok: false, error: "boom" });
      expect(body.failed).toBe(1);
      expect(body.synced).toBe(mongoose.modelNames().length - 1);
    } finally {
      (m as any).syncIndexes = orig;
    }
  });
});
