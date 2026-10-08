import { AtsType } from "./types";

export type DetectedSource = {
  atsType: AtsType;
  identifier: string;
  secondaryIdentifier?: string;
  careersUrl: string;
};

type Match = {
  atsType: AtsType;
  identifier: string;
  secondaryIdentifier?: string;
};

/**
 * Extract an ATS reference from any string — a board page URL, an ATS API/XHR
 * URL (as captured by the renderer), or embedded career-page markup.
 */
export function matchAts(s: string): Match | null {
  if (!s) return null;

  // Comeet (the dominant Israeli ATS): the embed fires XHRs that carry the
  // company uid + public token — the key unlock for Israeli startups.
  let m =
    s.match(
      /comeet\.co\/careers-api\/2\.0\/company\/([A-Za-z0-9.\-_]+)\/positions[^"'\s]*token=([A-Za-z0-9\-_]+)/i
    ) ||
    s.match(
      /comeet\.(?:co|com)\/jobs\/([A-Za-z0-9.]+)\/social\?token=([A-Za-z0-9\-_]+)/i
    ) ||
    s.match(
      /company-uid=([A-Za-z0-9.]+)[^"'\s]*token=([A-Za-z0-9\-_]+)|token=([A-Za-z0-9\-_]+)[^"'\s]*company-uid=([A-Za-z0-9.]+)/i
    );
  if (m) {
    const uid = m[1] || m[4];
    const token = m[2] || m[3];
    if (uid && token) return { atsType: "comeet", identifier: uid, secondaryIdentifier: token };
  }

  // Workday: the cxs jobs XHR, or the hosted job board URL.
  m = s.match(
    /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/([a-z0-9-]+)\/([A-Za-z0-9_]+)|(?:[a-z]{2}-[A-Za-z]{2}\/)?([A-Za-z0-9_]+))/i
  );
  if (m) {
    const host = `${m[1]}.${m[2]}.myworkdayjobs.com`;
    const tenant = m[3] || m[1];
    const site = m[4] || m[5];
    if (site) return { atsType: "workday", identifier: host, secondaryIdentifier: `${tenant}/${site}` };
  }

  m = s.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i)
    || s.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
  if (m && m[1] !== "embed") return { atsType: "greenhouse", identifier: m[1] };

  m = s.match(/api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/i)
    || s.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (m) return { atsType: "lever", identifier: m[1] };

  m = s.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/i)
    || s.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (m) return { atsType: "ashby", identifier: m[1] };

  m = s.match(/api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i)
    || s.match(/jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i);
  if (m) return { atsType: "smartrecruiters", identifier: m[1] };

  m = s.match(/([a-z0-9-]+)\.recruitee\.com/i);
  if (m) return { atsType: "recruitee", identifier: m[1] };

  m = s.match(/apply\.workable\.com\/(?:api\/[^"'\s]*accounts\/)?([a-z0-9_-]+)/i)
    || s.match(/([a-z0-9-]+)\.workable\.com/i);
  if (m && m[1] !== "api") return { atsType: "workable", identifier: m[1] };

  return null;
}

/** Detect from a URL directly (fast path, no network). */
export function detectFromUrl(raw: string): DetectedSource | null {
  const m = matchAts(raw);
  return m ? { ...m, careersUrl: raw } : null;
}

async function scanHtml(raw: string): Promise<DetectedSource | null> {
  try {
    const res = await fetch(raw, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = matchAts(html);
    return m ? { ...m, careersUrl: raw } : null;
  } catch {
    return null;
  }
}

/** Render the page (Puppeteer) and match ATS from captured network/HTML. */
async function detectViaRenderer(raw: string): Promise<DetectedSource | null> {
  const base = process.env.PUPPETEER_SERVER_URL || "http://localhost:4000";
  const token = process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  try {
    const res = await fetch(
      `${base}/api/detect-ats?url=${encodeURIComponent(raw)}${tokenParam}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const candidates: string[] = data?.requests ?? [];
    for (const u of candidates) {
      const m = matchAts(u);
      if (m) return { ...m, careersUrl: raw };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect an ATS from any careers URL: direct URL match → static HTML scan →
 * rendered detection (handles JS-loaded career pages). The last step builds the
 * catalog from arbitrary company career pages.
 */
export async function detectFromCareersPage(
  raw: string
): Promise<DetectedSource | null> {
  return (
    detectFromUrl(raw) ||
    (await scanHtml(raw)) ||
    (await detectViaRenderer(raw))
  );
}
