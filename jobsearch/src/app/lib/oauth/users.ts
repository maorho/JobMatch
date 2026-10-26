import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import type { OAuthProfile } from "./providers";

/**
 * Find the account for a social profile, or create one.
 * Order: same provider id → same (verified) email → new user. Linking by
 * email lets someone who signed up with a password later use "Continue with
 * Google" on the same address; an unverified email is never linked.
 */
export async function findOrCreateOAuthUser(profile: OAuthProfile) {
  await connectToDatabase();
  const email = profile.email.toLowerCase().trim();

  let user: any = await User.findOne({ authProvider: profile.provider, providerId: profile.providerId });
  if (!user && profile.emailVerified) {
    user = await User.findOne({ email });
    if (user && !user.providerId) {
      user.authProvider = profile.provider;
      user.providerId = profile.providerId;
      if (profile.avatar && !user.avatar) user.avatar = profile.avatar;
      await user.save();
    }
  }
  if (user) return { user, created: false };

  if (!profile.emailVerified) {
    throw Object.assign(new Error("Email not verified by provider"), { code: "EMAIL_UNVERIFIED" });
  }

  // Unique username from the email's local part ("dana.dev" → dana.dev, dana.dev2, …).
  const base = (email.split("@")[0] || "user").replace(/[^a-z0-9._-]/gi, "").slice(0, 24) || "user";
  let username = base;
  for (let i = 2; await User.exists({ username }); i++) username = `${base}${i}`;

  // Social accounts have no password; store an unguessable one so the
  // password login path can never match it.
  const password = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  user = await User.create({
    username,
    email,
    password,
    fullname: profile.name || base,
    phone: "",
    authProvider: profile.provider,
    providerId: profile.providerId,
    avatar: profile.avatar || "",
    recruiter: false,
    admin: false,
  });
  return { user, created: true };
}
