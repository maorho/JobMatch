import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import { detectFromCareersPage } from "@/app/lib/scout/detect";
import { normalizeDomain } from "@/app/lib/scout/logo";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function companyNameFromUrl(url: string, identifier: string): string {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    // Comeet hosted pages carry the company slug in the path (/jobs/{slug}/{uid}).
    if (/comeet\.(co|com)/.test(host)) {
      const seg = parsed.pathname.split("/").filter(Boolean);
      const slug = seg[0] === "jobs" ? seg[1] : seg[0];
      return cap((slug || identifier).replace(/[-_]/g, " "));
    }
    // On an ATS host, the board identifier is the best company name.
    if (
      /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs|smartrecruiters|recruitee|workable/.test(
        host
      )
    ) {
      return cap(identifier);
    }
    // Otherwise derive from the company's own domain: drop common subdomains
    // and the TLD, keep the main label (gong from careers.gong.io).
    host = host.replace(/^(www|careers|jobs|job|boards|apply|work|hire)\./, "");
    host = host.replace(
      /\.(com|io|ai|net|org|dev|tech|xyz|co\.il|org\.il|ac\.il|co)$/,
      ""
    );
    const label = host.split(".").pop() || identifier;
    return cap(label.length > 1 ? label : identifier);
  } catch {
    return cap(identifier);
  }
}

/**
 * Detect the ATS behind one or more careers URLs and (optionally) add them as
 * company sources. Guarded by cron_secret.
 * Body: { url? , urls?: string[], add?: boolean, companyName? }
 */
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const urls: string[] = body.urls || (body.url ? [body.url] : []);
  const add = body.add !== false; // default: add
  if (urls.length === 0) {
    return NextResponse.json({ error: "Provide url or urls[]" }, { status: 400 });
  }

  if (add) await connectToDatabase();

  const results: any[] = [];
  for (const url of urls.slice(0, 500)) {
    try {
      const det = await detectFromCareersPage(url);
      if (!det) {
        results.push({ url, detected: null });
        continue;
      }
      const companyName =
        (urls.length === 1 && body.companyName) ||
        companyNameFromUrl(url, det.identifier);
      let added = false;
      if (add) {
        await CompanySource.findOneAndUpdate(
          { atsType: det.atsType, identifier: det.identifier },
          {
            $set: {
              companyName,
              atsType: det.atsType,
              identifier: det.identifier,
              secondaryIdentifier: det.secondaryIdentifier,
              careersUrl: det.careersUrl,
              domain: normalizeDomain(new URL(url).hostname),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        added = true;
      }
      results.push({ url, companyName, ...det, added });
    } catch (e: any) {
      results.push({ url, error: e?.message || "detect failed" });
    }
  }

  const detected = results.filter((r) => r.atsType).length;
  return NextResponse.json({ ok: true, detected, total: urls.length, results });
}
