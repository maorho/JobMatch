import { SignJWT, jwtVerify, JWTPayload } from "jose";

 
export interface AppJwtPayload extends JWTPayload {
  id: string;
  email: string;
  fullname: string;
  admin: boolean;
}

const SECRET = process.env.JWT_SECRET || "secret";

// ממירים את ה־secret ל-Uint8Array, כפי ש-jose דורש
const secretKey = new TextEncoder().encode(SECRET);

export async function signJwt(
  payload: JWTPayload,
  options?: { expiresIn?: string }
): Promise<string> {
  const expiresIn = options?.expiresIn || "1h";

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyJwt<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as T;
  } catch (err) {
    console.error("❌ JWT verify error:", err);
    return null;
  }
}
