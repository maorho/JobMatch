import { NextRequest } from "next/server";
import { verifyJwt } from "./jwt";

export async function getUserIdFromRequest(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  if (!token) return null;

  try {
    const decoded = await verifyJwt<{ id: string }>(token);
    return decoded?.id || null;
  } catch {
    return null;
  }
}