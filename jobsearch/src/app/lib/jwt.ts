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

export async function signJwt(
  payload: JWTPayload,
  options?: { expiresIn?: string }
): Promise<string> {
  if (!secretKey) throw new Error("JWT_SECRET is not configured");
  const expiresIn = options?.expiresIn || "1h";

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
