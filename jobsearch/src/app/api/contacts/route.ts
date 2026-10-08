import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Contact from "@/app/models/Contact";
import { importContacts, contactsAtCompany, contactStats } from "@/app/lib/contacts/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/** GET → stats; GET ?company=Acme → the user's contacts there (+ stats). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  const stats = await contactStats(userId);
  const contacts = company ? await contactsAtCompany(userId, company, 12) : [];
  return NextResponse.json({ ok: true, stats, company, contacts });
}

/** POST multipart (field `file`: LinkedIn Connections.csv) or JSON { csv } → import. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let csv = "";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 413 });
    csv = await file.text();
  } else {
    const body = await req.json().catch(() => ({}));
    csv = String(body?.csv || "");
    if (csv.length > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!csv.trim()) return NextResponse.json({ error: "Empty file" }, { status: 400 });

  const result = await importContacts(userId, csv);
  if (result.parsed === 0) {
    return NextResponse.json({ error: "זה לא נראה כמו קובץ Connections.csv של לינקדאין (חסרות העמודות First Name / Last Name / Company)." }, { status: 422 });
  }
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $set: { "onboarding.contactsStep": "done" } });
  return NextResponse.json({ ok: true, ...result, stats: await contactStats(userId) });
}

/** DELETE → remove every imported contact of the user. */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const r = await Contact.deleteMany({ userId });
  await User.updateOne({ _id: userId }, { $set: { "onboarding.contactsStep": "" } });
  return NextResponse.json({ ok: true, deleted: r.deletedCount ?? 0 });
}
