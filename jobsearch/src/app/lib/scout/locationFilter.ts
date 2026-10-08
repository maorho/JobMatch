/**
 * Relevance filter: we only keep jobs that are in Israel OR remote.
 * Used both at ingestion (runScout) and for pruning the existing collection.
 */

const ISRAEL_RE =
  /\b(israel|ישראל|tel[\s-]?aviv|herzl[iy]ya|haifa|jerusalem|ramat[\s-]?gan|be'?er[\s-]?sheva|netanya|petah[\s-]?tikva|ra'?anana|rehovot|kfar[\s-]?saba|holon|ashdod|yokneam|caesarea|modi'?in)\b/i;

const REMOTE_RE = /\b(remote|anywhere|work[\s-]?from[\s-]?home|wfh)\b|מרחוק|מהבית/i;

export function isIsraelOrRemote(j: {
  job?: string;
  title?: string;
  city?: string;
  country?: string;
  description?: string;
}): boolean {
  const country = (j.country || "").trim();
  if (/^(il|isr|israel)$/i.test(country)) return true;

  const hay = `${j.city || ""} ${j.country || ""} ${j.job || j.title || ""} ${(
    j.description || ""
  ).slice(0, 600)}`;

  return ISRAEL_RE.test(hay) || REMOTE_RE.test(hay);
}
