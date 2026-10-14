import { SignJWT, jwtVerify, JWTPayload } from "jose";

 
export interface AppJwtPayload extends JWTPayload {
  id: string;
  email: string;
  fullname: string;
  admin: boolean;
}

// Fail closed: never fall back to a public default secret. If JWT_SECRET is
// missing, signing throws and verification rejects everything.
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error(
    "❌ JWT_SECRET is not set — token signing/verification is disabled."
  );
}
const secretKey = SECRET ? new TextEncoder().encode(SECRET) : null;

/** Session length. /api/auth/me re-signs the token once less than half of it is left. */
export const JWT_TTL_SEC = 7 * 24 * 3600;
export const JWT_REFRESH_BELOW_SEC = JWT_TTL_SEC / 2;

/** The `token` cookie, the same everywhere a session is issued (login, signup, OAuth, refresh). */
export const SESSION_COOKIE = {
  name: "token",
  httpOnly: true,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: JWT_TTL_SEC,
};

export async function signJwt(
  payload: JWTPayload,
  options?: { expiresIn?: string }
): Promise<string> {
  if (!secretKey) throw new Error("JWT_SECRET is not configured");
  const expiresIn = options?.expiresIn || `${JWT_TTL_SEC}s`;

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyJwt<T extends JWTPayload>(token: string): Promise<T | null> {
  if (!secretKey) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as T;
  } catch {
    // An expired/invalid token is a normal "not authenticated" outcome — the
    // caller handles the null; no need to log it as an error on every request.
    return null;
  }
}
