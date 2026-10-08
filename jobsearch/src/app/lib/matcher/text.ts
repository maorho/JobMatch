/**
 * Builders for the text we embed on each side of the match. Keep both sides
 * describing the same things (role, skills, seniority, location) so the vectors
 * live in a comparable space.
 */

export function buildJobText(job: {
  job?: string;
  company?: string;
  city?: string;
  country?: string;
  description?: string;
  skills?: string[];
  seniority?: string[];
}): string {
  const parts = [
    job.job,
    job.company,
    [job.city, job.country].filter(Boolean).join(", "),
    (job.seniority || []).join(", "),
    (job.skills || []).join(", "),
    (job.description || "").slice(0, 4000),
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildCandidateText(
  user: {
    currentJob?: string;
    company?: string;
    memory?: {
      skills?: string[];
      experience?: string[];
      preferences?: { preferredLanguage?: string };
    };
  },
  extraResumeText?: string
): string {
  const mem = user.memory || {};
  const parts = [
    user.currentJob ? `Current role: ${user.currentJob}` : "",
    (mem.skills || []).length ? `Skills: ${(mem.skills || []).join(", ")}` : "",
    (mem.experience || []).length
      ? `Experience: ${(mem.experience || []).join(". ")}`
      : "",
    extraResumeText ? extraResumeText.slice(0, 4000) : "",
  ];
  return parts.filter(Boolean).join("\n");
}
