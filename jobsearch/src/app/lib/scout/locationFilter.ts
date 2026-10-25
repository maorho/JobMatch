/**
 * Relevance filter: we only keep jobs that are in Israel OR remote.
 * Used both at ingestion (runScout) and for pruning the existing collection.
 */

/**
 * Latin text is matched after `latin()` below: lower-cased, apostrophes
 * dropped and hyphens turned into spaces, so "Be'er-Sheva", "Beer Sheva" and
 * "beersheva" all reach the same pattern. Names use \b so "Carmel" can't
 * match inside another word; multi-word names accept an optional space.
 */
const ISRAEL_LATIN_RE = new RegExp(
  "\\b(" +
    [
      "israel",
      "tel ?aviv(?: ?ya?fo)?",
      "jaffa|yafo",
      "herz?e?l[iy]+a|hertzl?iya",
      "haifa|hefa",
      "jerusalem|yerushalayim",
      "ramat ?gan",
      "beer ?sheva|beersheba|beer ?sheba|bersheva",
      "netanya|natanya",
      "peta[ch]h? ?ti[kq]v?[aw]a?h?",
      "raanana",
      "rehovot|rehoboth",
      "kfar ?sa[bv]a",
      "holon",
      "ashdod",
      "ashkelon|ashqelon",
      "yo[kq]neam|yokne ?am",
      "caesarea|qesarya",
      "modiin(?: ?maccabim)?(?: ?reut)?",
      "rosh ?ha ?ayin|rosh ?haayin",
      "hod ?hasharon|hod ?ha ?sharon",
      "kiryat ?ono|qiryat ?ono",
      "bnei ?brak|bene ?bera[kq]|bnei ?berak",
      "or ?yehuda",
      "ness? ?ziona|nes ?tsiyona",
      "yavne",
      "nazareth|natzrat|nazerat",
      "karmiel|carmiel",
      "migdal ?ha ?emek|migdal ?haemek",
      "binyamina",
      "airport ?city",
      "kiryat ?gat|qiryat ?gat",
      "lod",
      "ramla|ramle",
      "rishon ?le ?[tz]s?iy?on|rishon ?le ?tsiyon",
      "bat ?yam",
      "givatayim|givataim",
      "hadera",
      "tirat ?(?:ha ?)?[ck]armel",
      "nesher",
      "eilat|elat",
      "sderot",
      "kiryat ?(?:shmona|motzkin|bialik|yam|ata|malachi|tivon)",
      "beit ?shemesh|bet ?shemesh",
      // Not "acre"/"arad": English words / a Romanian city in free text ("175-acre campus",
      // "Arad, Romania"). They are matched only as a short location field (AMBIGUOUS_CITY_RE).
      "afula|tiberias|safed|tzfat|akko|nahariya|dimona|ofakim",
    ].join("|") +
    ")\\b",
  "i"
);

/** Lower-case, drop apostrophes/quotes, flatten hyphens and runs of spaces. */
const latin = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'`"]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ");

// JavaScript's \b is ASCII-only, so Hebrew names must be matched without it.
// Includes the regions Israeli agency boards use as locations (מרכז, שפלה...).
const ISRAEL_HEBREW_RE =
  /(ישראל|תל[\s-]?אביב|הרצליה|חיפה|ירושלים|רמת[\s-]?גן|באר[\s-]?שבע|נתניה|פתח[\s-]?תקוו?ה|רעננה|רחובות|כפר[\s-]?סבא|חולון|אשדוד|אשקלון|יוקנעם|מודיעין|ראש[\s-]?העין|הוד[\s-]?השרון|קרית[\s-]?אונו|בני[\s-]?ברק|אור[\s-]?יהודה|נס[\s-]?ציונה|יבנה|נצרת|כרמיאל|מגדל[\s-]?העמק|קיסריה|בנימינה|קרית[\s-]?גת|לוד|רמלה|ראשון[\s-]?לציון|בת[\s-]?ים|גבעתיים|חדרה|טירת[\s-]?הכרמל|נשר|אילת|שדרות|מרכז|שפלה|שרון|צפון|דרום)/;

/** Israeli city names that are also common words / foreign places: trusted only in a short location field. */
const AMBIGUOUS_CITY_RE = /\b(acre|arad)\b/;
const SHORT_LOCATION_MAX = 40;

const REMOTE_RE = /\b(remote|anywhere|work ?from ?home|wfh)\b|מרחוק|מהבית/i;
/**
 * "not remote", "no remote work", "non-remote", "isn't a remote role",
 * "without remote option": the word appears, the meaning is the opposite.
 * These phrases are removed before REMOTE_RE runs; "on-site only" never
 * matched in the first place.
 */
/**
 * Negation AFTER the word: "Remote work is not available", "remote isn't
 * possible for this role", "WFH not offered". Runs on latin() text (so
 * "isn't" is "isnt"); stays inside one clause and ~40 chars.
 */
const REMOTE_NEGATED_AFTER_RE = /\b(?:remote|wfh|work ?from ?home)\b[^.;!?\n]{0,40}?\b(?:(?:is |are |was )?not|isnt|arent|no longer|never)\s+(?:(?:currently|really|yet)\s+)?(?:available|possible|offered|an option|supported|allowed|permitted)\b|\b(?:remote|wfh|work ?from ?home)\b[^.;!?\n]{0,40}?\bunavailable\b/gi;
const NOT_REMOTE_RE = /\b(?:not|no|non|never|isnt|is not|without|zero)\s*(?:a |an |fully |100% |any )?(?:remote(?: work| option| position| role)?|wfh|work ?from ?home)\b|(?:לא|ללא|אין)\s*(?:עבודה\s*)?(?:מרחוק|מהבית)/gi;

export function isIsraelOrRemote(j: {
  job?: string;
  title?: string;
  city?: string;
  country?: string;
  remote?: boolean;
  description?: string;
}): boolean {
  if (j.remote === true) return true;
  const country = (j.country || "").trim();
  if (/^(il|isr|israel)$/i.test(country)) return true;

  const hay = `${j.city || ""} ${j.country || ""} ${j.job || j.title || ""} ${(
    j.description || ""
  ).slice(0, 600)}`;
  const flat = latin(hay);

  if (ISRAEL_LATIN_RE.test(flat) || ISRAEL_HEBREW_RE.test(hay)) return true;
  if (ambiguousIsraeliCity(j.city, j.country)) return true;
  return REMOTE_RE.test(flat.replace(NOT_REMOTE_RE, " ").replace(REMOTE_NEGATED_AFTER_RE, " "));
}

/**
 * "Acre" / "Arad" count only as a short location field that is exactly the
 * city ("Arad", "Acre") or names Israel ("Acre, IL"). "Arad, Romania" and a
 * description's "175-acre campus" never get here as Israel.
 */
function ambiguousIsraeliCity(city?: string, country?: string): boolean {
  const c = (country || "").trim();
  const loc = latin([city || "", /^unknown$/i.test(c) ? "" : c].filter((x) => x.trim()).join(", ")).trim();
  if (!loc || loc.length > SHORT_LOCATION_MAX || !AMBIGUOUS_CITY_RE.test(loc)) return false;
  return /^(acre|arad)$/.test(loc) || /\b(israel|il|isr)\b/.test(loc);
}
