/**
 * Minimal Gmail REST client (read-only) — no SDK, three endpoints:
 * token refresh, messages.list, messages.get.
 */
export type GmailMessage = {
  id: string;
  from: string;
  subject: string;
  date: Date;
  snippet: string;
  body: string; // plain text, bounded
};

const G = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw Object.assign(new Error(`Gmail token refresh failed: ${data.error_description || data.error || res.status}`), { code: data.error === "invalid_grant" ? "REVOKED" : "TOKEN" });
  }
  return String(data.access_token);
}

/** Gmail search query for application-related mail newer than `days`. */
export function applicationMailQuery(days = 14): string {
  const terms = [
    "interview", "application", "applied", "candidacy", "position", "offer", "unfortunately", "next steps", "recruit", "hiring",
    "ראיון", "מועמדות", "מועמדותך", "משרה", "המשרה", "תודה על פנייתך", "הצעת עבודה", "גיוס",
  ];
  return `newer_than:${days}d -category:promotions -category:social (${terms.map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" OR ")})`;
}

function header(payload: any, name: string): string {
  const h = (payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function b64(s: string): string {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** Walk MIME parts; prefer text/plain, fall back to stripped text/html. */
export function extractBody(payload: any): string {
  let plain = "";
  let html = "";
  const walk = (p: any) => {
    if (!p) return;
    const mime = String(p.mimeType || "");
    const data = p.body?.data ? b64(p.body.data) : "";
    if (mime === "text/plain" && data && !plain) plain = data;
    else if (mime === "text/html" && data && !html) html = data;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  const text = plain || html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  return text.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

export async function listApplicationMessages(accessToken: string, opts: { days?: number; max?: number } = {}): Promise<GmailMessage[]> {
  const q = applicationMailQuery(opts.days ?? 14);
  const max = Math.min(opts.max ?? 40, 100);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(`${G}/messages?q=${encodeURIComponent(q)}&maxResults=${max}`, { headers, cache: "no-store" });
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const list = await listRes.json();
  const ids: string[] = (list.messages || []).map((m: any) => m.id);

  const out: GmailMessage[] = [];
  for (const id of ids) {
    const res = await fetch(`${G}/messages/${id}?format=full`, { headers, cache: "no-store" });
    if (!res.ok) continue;
    const m = await res.json();
    const payload = m.payload || {};
    out.push({
      id: String(m.id),
      from: header(payload, "From"),
      subject: header(payload, "Subject"),
      date: new Date(Number(m.internalDate) || Date.now()),
      snippet: String(m.snippet || ""),
      body: extractBody(payload),
    });
  }
  return out;
}
