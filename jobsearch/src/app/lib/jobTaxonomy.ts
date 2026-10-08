/**
 * Shared job taxonomy — the single source of truth for how a posting is
 * bucketed by seniority and work mode. Imported by BOTH the client (filter
 * chips, cards) and the server (DB search), so a "Junior" filter in the UI
 * selects exactly the jobs the card would label "Junior".
 *
 * Plain module: no React, no Mongoose, safe to import anywhere.
 */

export const SENIORITY_LEVELS = ["Intern", "Junior", "Mid", "Senior"] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const WORK_MODES = ["Remote", "Hybrid", "On Site"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

// Precedence when several match: Intern → Junior → Senior → Mid (default).
export const INTERN_RE = /\b(intern|internship)\b/i;
export const JUNIOR_RE =
  /\b(junior|jr\.?|entry[- ]?level|graduate|new.?grad|associate|student)\b/i;
export const SENIOR_RE =
  /\b(senior|sr\.?|staff|principal|lead|director|head|vp|architect|manager|management)\b/i;

export const REMOTE_RE = /remote/i;
export const HYBRID_RE = /hybrid/i;

/** Seniority bucket from a title plus the ATS `seniority` field (array or string). */
export function seniorityOf(
  title: string | undefined,
  seniority: string[] | string | undefined
): SeniorityLevel {
  const sen = Array.isArray(seniority) ? seniority.join(" ") : seniority || "";
  const hay = `${sen} ${title || ""}`;
  if (INTERN_RE.test(hay)) return "Intern";
  if (JUNIOR_RE.test(hay)) return "Junior";
  if (SENIOR_RE.test(hay)) return "Senior";
  return "Mid";
}

/**
 * Work mode. Internal postings carry it explicitly in `type`; ATS postings
 * are inferred from the LOCATION fields only (ATSes put "Remote" in the
 * location when a role is remote). The description is deliberately ignored:
 * most postings mention "remote" somewhere in boilerplate, which would label
 * nearly everything Remote.
 */
export function workModeOf(opts: {
  type?: string;
  city?: string;
  country?: string;
  description?: string; // accepted for call-site compatibility, not used
}): WorkMode {
  if (opts.type) {
    const t = opts.type.toLowerCase();
    if (t.includes("remote")) return "Remote";
    if (t.includes("hybrid")) return "Hybrid";
    return "On Site";
  }
  const hay = `${opts.city || ""} ${opts.country || ""}`;
  if (REMOTE_RE.test(hay)) return "Remote";
  if (HYBRID_RE.test(hay)) return "Hybrid";
  return "On Site";
}
