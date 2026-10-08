import { connectToDatabase } from "@/app/lib/db";
import Contact from "@/app/models/Contact";

/**
 * LinkedIn "Connections.csv" (Settings → Data privacy → Get a copy of your
 * data → Connections). The file starts with a few "Notes:" lines, then a
 * header: First Name, Last Name, URL, Email Address, Company, Position,
 * Connected On. Fields may be quoted and contain commas.
 */
export type ParsedContact = {
  firstName: string;
  lastName: string;
  fullName: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn?: Date;
};

/** Lower-cased company name without legal suffixes / punctuation, for matching. */
export function companyKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(ltd|inc|llc|corp|corporation|co|company|technologies|technology|tech|labs|group|israel|il|the|software|solutions|systems|holdings|plc|gmbh|ag|sa|bv)\b\.?/g, " ")
    .replace(/[^a-z0-9֐-׿]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Minimal RFC-4180 parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, keyof ParsedContact> = {
  "first name": "firstName",
  "last name": "lastName",
  url: "url",
  "email address": "email",
  email: "email",
  company: "company",
  position: "position",
  "connected on": "connectedOn",
};

/** Parse the export; tolerates the "Notes:" preamble and column reordering. */
export function parseLinkedInConnections(text: string): ParsedContact[] {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => r.map((c) => c.trim().toLowerCase()).includes("first name"));
  if (headerIdx === -1) return [];
  const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const col = (name: keyof ParsedContact) => header.findIndex((h) => HEADER_ALIASES[h] === name);
  const idx = { firstName: col("firstName"), lastName: col("lastName"), url: col("url"), email: col("email"), company: col("company"), position: col("position"), connectedOn: col("connectedOn") };
  const pick = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");

  const out: ParsedContact[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const firstName = pick(r, idx.firstName);
    const lastName = pick(r, idx.lastName);
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const url = pick(r, idx.url);
    const email = pick(r, idx.email).toLowerCase();
    if (!fullName && !url && !email) continue;
    const when = pick(r, idx.connectedOn);
    const connectedOn = when ? new Date(when) : undefined;
    out.push({
      firstName,
      lastName,
      fullName,
      url,
      email,
      company: pick(r, idx.company),
      position: pick(r, idx.position),
      connectedOn: connectedOn && !isNaN(connectedOn.getTime()) ? connectedOn : undefined,
    });
  }
  return out;
}

export type ImportResult = { parsed: number; imported: number; updated: number; withCompany: number; companies: number };

/** Upsert a user's connections; re-importing the same file is a no-op. */
export async function importContacts(userId: string, csvText: string): Promise<ImportResult> {
  await connectToDatabase();
  const parsed = parseLinkedInConnections(csvText);
  if (!parsed.length) return { parsed: 0, imported: 0, updated: 0, withCompany: 0, companies: 0 };
  const ops = parsed.map((c) => {
    const dedupeKey = c.url || c.email || `${c.fullName}|${c.company}`.toLowerCase();
    return {
      updateOne: {
        filter: { userId, dedupeKey },
        update: { $set: { ...c, companyKey: companyKey(c.company), source: "linkedin" }, $setOnInsert: { userId, dedupeKey } },
        upsert: true,
      },
    };
  });
  let imported = 0;
  let updated = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const r = await Contact.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    imported += r.upsertedCount ?? 0;
    updated += r.modifiedCount ?? 0;
  }
  const withCompany = parsed.filter((c) => companyKey(c.company)).length;
  const companies = new Set(parsed.map((c) => companyKey(c.company)).filter(Boolean)).size;
  return { parsed: parsed.length, imported, updated, withCompany, companies };
}

export type ContactLite = { _id: string; fullName: string; position: string; company: string; url: string; email: string };

/** The user's contacts at a company (fuzzy: either key contains the other). */
export async function contactsAtCompany(userId: string, company: string, limit = 20): Promise<ContactLite[]> {
  const key = companyKey(company);
  if (!key || key.length < 2) return [];
  await connectToDatabase();
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs: any[] = await Contact.find({ userId, $or: [{ companyKey: key }, { companyKey: new RegExp(`(^|\\s)${escaped}(\\s|$)`) }] })
    .select("fullName position company url email companyKey")
    .limit(limit * 3)
    .lean();
  // Exact key first, then the fuzzy matches.
  docs.sort((a, b) => Number(b.companyKey === key) - Number(a.companyKey === key));
  return docs.slice(0, limit).map((d) => ({ _id: String(d._id), fullName: d.fullName, position: d.position, company: d.company, url: d.url, email: d.email }));
}

export async function contactStats(userId: string): Promise<{ total: number; companies: number; lastImportAt: Date | null }> {
  await connectToDatabase();
  const [total, companies, last] = await Promise.all([
    Contact.countDocuments({ userId }),
    Contact.distinct("companyKey", { userId, companyKey: { $ne: "" } }).then((a) => a.length),
    Contact.findOne({ userId }).sort({ updatedAt: -1 }).select("updatedAt").lean() as Promise<any>,
  ]);
  return { total, companies, lastImportAt: last?.updatedAt ?? null };
}
