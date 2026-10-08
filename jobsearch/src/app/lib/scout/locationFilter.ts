/**
 * Relevance filter: we only keep jobs that are in Israel OR remote.
 * Used both at ingestion (runScout) and for pruning the existing collection.
 */

// Latin names use \b so "Carmel" can't match inside another word.
const ISRAEL_LATIN_RE =
  /\b(israel|tel[\s-]?aviv|herzl[iy]ya|haifa|jerusalem|ramat[\s-]?gan|be'?er[\s-]?sheva|netanya|petah[\s-]?tikva|ra'?anana|rehovot|kfar[\s-]?saba|holon|ashdod|yokneam|caesarea|modi'?in)\b/i;

// JavaScript's \b is ASCII-only, so Hebrew names must be matched without it.
// Includes the regions Israeli agency boards use as locations (מרכז, שפלה...).
const ISRAEL_HEBREW_RE =
  /(ישראל|תל[\s-]?אביב|הרצליה|חיפה|ירושלים|רמת[\s-]?גן|באר[\s-]?שבע|נתניה|פתח[\s-]?תקוו?ה|רעננה|רחובות|כפר[\s-]?סבא|חולון|אשדוד|יוקנעם|מודיעין|מרכז|שפלה|שרון|צפון|דרום)/;

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

  return ISRAEL_LATIN_RE.test(hay) || ISRAEL_HEBREW_RE.test(hay) || REMOTE_RE.test(hay);
}
