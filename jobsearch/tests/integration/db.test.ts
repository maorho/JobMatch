import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../setup/mongo";
import { connectToDatabase } from "@/app/lib/db";

setupTestDb();

describe("connectToDatabase", () => {
  it("rides out a transient drop on the same MongoClient (no second client, no leaked pool)", async () => {
    await connectToDatabase();
    const client = mongoose.connection.getClient();
    expect(await connectToDatabase()).toBe(mongoose);
    expect(mongoose.connection.getClient()).toBe(client);

    // What Mongoose does during an Atlas primary election: readyState → 0, no 'close'.
    (mongoose.connection as any).readyState = 0;
    const pending = connectToDatabase();
    (mongoose.connection as any).readyState = 1; // the driver found the new primary
    await pending;
    expect(mongoose.connection.getClient()).toBe(client);
  });

  it("reconnects with a fresh client after an explicit disconnect", async () => {
    const before = mongoose.connection.getClient();
    await mongoose.disconnect();
    await connectToDatabase();
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.getClient()).not.toBe(before);
    expect(await mongoose.connection.db!.admin().ping()).toMatchObject({ ok: 1 });
  });
});
