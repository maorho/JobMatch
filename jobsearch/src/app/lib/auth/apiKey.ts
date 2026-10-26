import crypto from "crypto";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";

/**
 * Personal API keys for external agents (MCP clients such as Claude, ChatGPT,
 * Cursor). Shown once, stored hashed; a prefix is kept for display.
 * Format: jm_live_<40 base62 chars>.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateApiKey(): string {
  const bytes = crypto.randomBytes(40);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `jm_live_${out}`;
}

export const hashApiKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
export const apiKeyPrefix = (key: string) => key.slice(0, 12) + "…";

/** Issue (or rotate) the user's key; returns the plain key exactly once. */
export async function issueApiKey(userId: string): Promise<{ key: string; prefix: string }> {
  await connectToDatabase();
  const key = generateApiKey();
  await User.updateOne({ _id: userId }, { $set: { apiKeyHash: hashApiKey(key), apiKeyPrefix: apiKeyPrefix(key), apiKeyCreatedAt: new Date() } });
  return { key, prefix: apiKeyPrefix(key) };
}

export async function revokeApiKey(userId: string): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $unset: { apiKeyHash: 1, apiKeyPrefix: 1, apiKeyCreatedAt: 1 } });
}

/** Resolve a bearer token to a user id, or null. */
export async function userIdFromApiKey(bearer: string | null | undefined): Promise<string | null> {
  const key = (bearer || "").replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("jm_live_") || key.length < 30) return null;
  await connectToDatabase();
  const u: any = await User.findOne({ apiKeyHash: hashApiKey(key) }).select("_id").lean();
  return u ? String(u._id) : null;
}
