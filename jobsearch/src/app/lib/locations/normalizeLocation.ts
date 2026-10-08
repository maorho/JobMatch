/**
 * Deterministic location normalizer — stage 1 of the location agent.
 *
 * ATS feeds hand us anything: "Tel Aviv-Yafo", "IL", "il", "Israel - Hybrid
 * (3 days)", "Alabama; Remote - Virginia; Remote - Washington D.C.",
 * "Amsterdam (Remote)", "21 Ha'Arba'a St.", "ירושלים", "מרכז". This turns
 * each into a canonical { city, country, remote } so filters and facets show
 * "Israel" once instead of "IL / il / ISR / israel / Israel".
 *
 * Pure and synchronous. Strings it can't resolve come back with
 * confidence "low" so the LLM stage (resolveLocations.ts) can take them.
 */

export type NormalizedLocation = {
  raw: string;
  city: string;
  country: string; // canonical English short name, "" when unknown
  region?: string; // Israeli region (Center, North...) or US state
  remote: boolean;
  confidence: "high" | "medium" | "low";
};

const REMOTE_RE =
  /\b(remote|anywhere|distributed|work[\s-]?from[\s-]?home|wfh|home[\s-]?office)\b|מרחוק|מהבית|היברידי|עבודה מהבית/i;
const HYBRID_RE = /\bhybrid\b|היבריד/i;

/** ISO2 / ISO3 / common aliases → canonical name. Lower-case keys. */
const COUNTRY_ALIASES: Record<string, string> = {};
function country(name: string, ...aliases: string[]) {
  COUNTRY_ALIASES[name.toLowerCase()] = name;
  for (const a of aliases) COUNTRY_ALIASES[a.toLowerCase()] = name;
}
country("Israel", "il", "isr", "ישראל", "state of israel");
country("United States", "us", "usa", "u.s.", "u.s.a.", "united states of america", "america", "ארצות הברית");
country("United Kingdom", "gb", "gbr", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales");
country("Germany", "de", "deu", "deutschland");
country("France", "fr", "fra");
country("Spain", "es", "esp");
country("Portugal", "pt", "prt");
country("Italy", "it", "ita");
country("Netherlands", "nl", "nld", "the netherlands", "holland");
country("Belgium", "be", "bel");
country("Ireland", "ie", "irl", "republic of ireland");
country("Switzerland", "ch", "che");
country("Austria", "at", "aut");
country("Poland", "pl", "pol");
country("Czech Republic", "cz", "cze", "czechia");
country("Hungary", "hu", "hun");
country("Romania", "ro", "rou");
country("Bulgaria", "bg", "bgr");
country("Greece", "gr", "grc");
country("Cyprus", "cy", "cyp");
country("Ukraine", "ua", "ukr");
country("Lithuania", "lt", "ltu");
country("Latvia", "lv", "lva");
country("Estonia", "ee", "est");
country("Sweden", "se", "swe");
country("Norway", "no", "nor");
country("Denmark", "dk", "dnk");
country("Finland", "fi", "fin");
country("Canada", "ca", "can");
country("Mexico", "mx", "mex");
country("Brazil", "br", "bra", "brasil");
country("Argentina", "ar", "arg");
country("Colombia", "co", "col");
country("Chile", "cl", "chl");
country("Paraguay", "py", "pry");
country("Honduras", "hn", "hnd");
country("India", "in", "ind");
country("China", "cn", "chn");
country("Japan", "jp", "jpn");
country("South Korea", "kr", "kor", "korea", "republic of korea");
country("Singapore", "sg", "sgp");
country("Australia", "au", "aus");
country("New Zealand", "nz", "nzl");
country("Philippines", "ph", "phl");
country("Vietnam", "vn", "vnm");
country("Thailand", "th", "tha");
country("Indonesia", "id", "idn");
country("Malaysia", "my", "mys");
country("Taiwan", "tw", "twn");
country("Hong Kong", "hk", "hkg");
country("United Arab Emirates", "ae", "are", "uae", "dubai");
country("Saudi Arabia", "sa", "sau");
country("Turkey", "tr", "tur", "türkiye");
country("Egypt", "eg", "egy");
country("South Africa", "za", "zaf");
country("Nigeria", "ng", "nga");
country("Kenya", "ke", "ken");
country("Serbia", "rs", "srb");
country("Croatia", "hr", "hrv");
country("Slovakia", "sk", "svk");
country("Slovenia", "si", "svn");
country("Georgia", "ge", "geo"); // the country; "Georgia" the US state is handled below
country("Armenia", "am", "arm");
country("Kazakhstan", "kz", "kaz");
country("Pakistan", "pk", "pak");
country("Bangladesh", "bd", "bgd");
country("Sri Lanka", "lk", "lka");
country("Costa Rica", "cr", "cri");
country("Peru", "pe", "per");
country("Uruguay", "uy", "ury");
country("Luxembourg", "lu", "lux");
country("Malta", "mt", "mlt");
country("Iceland", "is", "isl");

/** US states (name and postal code) → canonical state name. */
const US_STATES: Record<string, string> = {};
const STATES: [string, string][] = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"], ["California", "CA"], ["Colorado", "CO"],
  ["Connecticut", "CT"], ["Delaware", "DE"], ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"], ["Idaho", "ID"],
  ["Illinois", "IL"], ["Indiana", "IN"], ["Iowa", "IA"], ["Kansas", "KS"], ["Kentucky", "KY"], ["Louisiana", "LA"],
  ["Maine", "ME"], ["Maryland", "MD"], ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"], ["Mississippi", "MS"],
  ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"], ["Nevada", "NV"], ["New Hampshire", "NH"], ["New Jersey", "NJ"],
  ["New Mexico", "NM"], ["New York", "NY"], ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"], ["Oklahoma", "OK"],
  ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"], ["South Carolina", "SC"], ["South Dakota", "SD"],
  ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"], ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"],
  ["West Virginia", "WV"], ["Wisconsin", "WI"], ["Wyoming", "WY"], ["Washington D.C.", "DC"],
];
US_STATES["district of columbia"] = "Washington D.C.";
US_STATES["d.c."] = "Washington D.C.";
for (const [name, code] of STATES) {
  US_STATES[name.toLowerCase()] = name;
  US_STATES[code.toLowerCase()] = name;
}
// Postal codes that collide with country codes are only states in a US context.
const AMBIGUOUS_STATE_CODES = new Set(["il", "in", "de", "ca", "co", "ga", "id", "me", "md", "mt", "ms", "la", "ne", "nv", "pa", "sc", "ar", "al", "mo", "ma", "mi", "ri", "nc", "nd", "sd", "or", "ok", "oh", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "hi", "ia", "ks", "ky", "mn", "nh", "nj", "nm", "ny", "fl", "az", "ak", "ct", "dc"]);

/** Israeli cities: canonical English ← aliases (Latin + Hebrew). */
const IL_CITIES: Record<string, string> = {};
function ilCity(name: string, ...aliases: string[]) {
  IL_CITIES[name.toLowerCase()] = name;
  for (const a of aliases) IL_CITIES[a.toLowerCase()] = name;
}
ilCity("Tel Aviv", "tel aviv-yafo", "tel-aviv", "tel aviv yafo", "tel-aviv-yafo", "tlv", "תל אביב", "תל-אביב", "תל אביב-יפו", "tel aviv, israel", "tel aviv district", "tel aviv area", "gush dan");
ilCity("Jerusalem", "ירושלים", "yerushalayim");
ilCity("Haifa", "חיפה");
ilCity("Herzliya", "herzliyya", "herzelia", "herzlia", "הרצליה");
ilCity("Ramat Gan", "ramat-gan", "רמת גן", "רמת-גן");
ilCity("Petah Tikva", "petach tikva", "petah tiqwa", "petah-tikva", "פתח תקווה", "פתח תקוה");
ilCity("Ra'anana", "raanana", "ra'anana", "רעננה");
ilCity("Be'er Sheva", "beer sheva", "beersheba", "be'er-sheva", "beer-sheva", "באר שבע");
ilCity("Netanya", "נתניה");
ilCity("Rehovot", "רחובות");
ilCity("Kfar Saba", "kfar-saba", "kefar sava", "kfar sava", "כפר סבא");
ilCity("Karmiel", "carmiel", "כרמיאל");
ilCity("Kiryat Ono", "קריית אונו");
ilCity("Kiryat Bialik", "קריית ביאליק");
ilCity("Yavne", "יבנה");
ilCity("Migdal HaEmek", "migdal haemek", "מגדל העמק");
ilCity("Hod Hasharon", "hod ha'sharon", "hod-hasharon", "הוד השרון");
ilCity("Yokneam", "yoqneam", "yokneam illit", "יוקנעם");
ilCity("Caesarea", "קיסריה");
ilCity("Modi'in", "modiin", "modi'in", "מודיעין");
ilCity("Holon", "חולון");
ilCity("Ashdod", "אשדוד");
ilCity("Rosh Ha'ayin", "rosh haayin", "rosh ha'ayin", "ראש העין");
ilCity("Or Yehuda", "אור יהודה");
ilCity("Bnei Brak", "bne brak", "bnei berak", "bnei-brak", "בני ברק");
ilCity("Airport City", "airport", "קריית שדה התעופה");
ilCity("Kiryat Gat", "קריית גת");
ilCity("Nazareth", "נצרת");
ilCity("Ness Ziona", "nes ziona", "נס ציונה");
ilCity("Lod", "לוד");
ilCity("Ramla", "רמלה");
ilCity("Ashkelon", "אשקלון");
ilCity("Eilat", "אילת");
ilCity("Hadera", "חדרה");
ilCity("Kfar Yona", "כפר יונה");
ilCity("Givatayim", "giv'atayim", "givataim", "גבעתיים");
ilCity("Beit Shemesh", "בית שמש");
ilCity("Rishon LeZion", "rishon lezion", "rishon le zion", "rishon letsiyon", "rishon letziyon", "ראשון לציון");
ilCity("Yehud", "yehud-monosson", "יהוד");

/** Canadian provinces (ATS strings like "Canada - Remote (ON, or NS Only)"). */
const CA_PROVINCES: Record<string, string> = {};
for (const [name, code] of [["Ontario", "ON"], ["Quebec", "QC"], ["British Columbia", "BC"], ["Alberta", "AB"], ["Nova Scotia", "NS"],
  ["Manitoba", "MB"], ["Saskatchewan", "SK"], ["New Brunswick", "NB"], ["Newfoundland and Labrador", "NL"], ["Prince Edward Island", "PE"]] as [string, string][]) {
  CA_PROVINCES[name.toLowerCase()] = name;
  CA_PROVINCES[code.toLowerCase()] = name;
}

/** Area words ATSes put in the city slot; they are regions, never cities. */
const AREA_WORDS = new Set([
  "central", "central us", "east coast", "west coast", "midwest", "emea", "eu", "europe", "apac", "latam", "latin america",
  "north america", "americas", "nordics", "dach", "benelux", "global", "worldwide", "general", "distributed", "dnu",
  "multiple locations", "various", "flexible", "other", "international", "us", "usa", "uk", "national", "nationwide",
  "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest", "usa east coast", "usa west coast",
]);

/** Hebrew regions used by agency boards instead of a city. */
const IL_REGIONS: Record<string, string> = {
  "מרכז": "Center", "אזור המרכז": "Center", "גוש דן": "Center", "שפלה": "Shfela", "שרון": "Sharon",
  "צפון": "North", "דרום": "South", "ירושלים והסביבה": "Jerusalem area", "השרון": "Sharon",
};

/** World cities we see often enough to resolve the country offline. */
const WORLD_CITIES: Record<string, [string, string]> = {};
function wc(city: string, countryName: string, ...aliases: string[]) {
  WORLD_CITIES[city.toLowerCase()] = [city, countryName];
  for (const a of aliases) WORLD_CITIES[a.toLowerCase()] = [city, countryName];
}
wc("London", "United Kingdom"); wc("Manchester", "United Kingdom"); wc("Dublin", "Ireland"); wc("Berlin", "Germany");
wc("Munich", "Germany", "münchen"); wc("Amsterdam", "Netherlands"); wc("Paris", "France"); wc("Madrid", "Spain");
wc("Barcelona", "Spain"); wc("Lisbon", "Portugal"); wc("Warsaw", "Poland"); wc("Krakow", "Poland", "kraków");
wc("Prague", "Czech Republic"); wc("Vienna", "Austria"); wc("Zurich", "Switzerland", "zürich"); wc("Stockholm", "Sweden");
wc("Copenhagen", "Denmark"); wc("Helsinki", "Finland"); wc("Oslo", "Norway"); wc("Vilnius", "Lithuania"); wc("Kyiv", "Ukraine", "kiev");
wc("Bucharest", "Romania"); wc("Sofia", "Bulgaria"); wc("Athens", "Greece"); wc("Limassol", "Cyprus"); wc("Nicosia", "Cyprus");
wc("Toronto", "Canada"); wc("Vancouver", "Canada"); wc("Montreal", "Canada"); wc("Mexico City", "Mexico");
wc("São Paulo", "Brazil", "sao paulo"); wc("Buenos Aires", "Argentina"); wc("Bogotá", "Colombia", "bogota"); wc("Santiago", "Chile");
wc("Asunción", "Paraguay", "asuncion"); wc("Bangalore", "India", "bengaluru"); wc("Hyderabad", "India"); wc("Pune", "India");
wc("Mumbai", "India"); wc("Chennai", "India"); wc("Singapore", "Singapore"); wc("Tokyo", "Japan"); wc("Seoul", "South Korea");
wc("Sydney", "Australia"); wc("Melbourne", "Australia"); wc("Dubai", "United Arab Emirates"); wc("Manila", "Philippines");
wc("Belgrade", "Serbia"); wc("Tallinn", "Estonia"); wc("Riga", "Latvia"); wc("Cairo", "Egypt"); wc("Istanbul", "Turkey");
wc("Taipei", "Taiwan"); wc("Hong Kong", "Hong Kong"); wc("Kuala Lumpur", "Malaysia"); wc("Jakarta", "Indonesia");
// US cities (country United States)
for (const c of ["New York", "San Francisco", "Seattle", "Austin", "Atlanta", "Boston", "Chicago", "Denver", "Dallas", "Houston",
  "Los Angeles", "San Jose", "San Diego", "Miami", "Phoenix", "Portland", "Washington", "Philadelphia", "Minneapolis", "Salt Lake City",
  "Raleigh", "Nashville", "Charlotte", "Detroit", "Pittsburgh", "Columbus", "Indianapolis", "Las Vegas", "Sacramento", "Palo Alto",
  "Mountain View", "Sunnyvale", "Santa Clara", "Redmond", "Bellevue", "Cupertino", "Menlo Park", "Irvine", "Reston", "Arlington"]) wc(c, "United States");
wc("New York", "United States", "nyc", "new york city"); wc("San Francisco", "United States", "sf", "san francisco bay area", "sf bay area", "bay area");
wc("Seattle", "United States", "sea"); wc("Warsaw", "Poland", "warszawa"); wc("Washington", "United States", "washington dc", "washington d.c.");

const STREET_RE = /^\d+\s|\b(st\.|street|rd\.|road|ave\.?|avenue|blvd|floor|fl\.|bldg|building|suite)\b/i;
const JUNK_RE = /^(n\/a|na|none|null|undefined|unknown|tbd|-|—|\.)$/i;
const MULTI_SPLIT = /\s*(?:;|\||•|\/|&| or | and )\s*/i;
const TOKEN_SPLIT = /\s*(?:,|\(|\)|\s[-–—]\s|:)\s*/;

// Collapse whitespace and curly apostrophes (Giv‘atayim → Giv'atayim).
const title = (s: string) => s.replace(/[‘’ʼ`´]/g, "'").replace(/\s+/g, " ").trim();

/** "karmiel" → "Karmiel", "new york" → "New York" for cities not in the alias tables. */
const titleCase = (s: string) =>
  s.replace(/\p{L}[\p{L}'.-]*/gu, (w) => (w === w.toUpperCase() && w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));

function matchCountry(tok: string): string | null {
  const k = tok.toLowerCase();
  // "U.S." / "U.K." → "us" / "uk"
  return COUNTRY_ALIASES[k] ?? COUNTRY_ALIASES[k.replace(/\.$/, "")] ?? COUNTRY_ALIASES[k.replace(/\./g, "")] ?? null;
}

/**
 * Normalize a raw city/country pair. Either may be empty; the country field,
 * when it is a recognisable country, wins over anything inferred from city.
 */
export function normalizeLocation(input: { city?: string; country?: string }): NormalizedLocation {
  const rawCity = title(input.city || "");
  const rawCountry = title(input.country || "");
  const raw = [rawCity, rawCountry].filter(Boolean).join(", ");
  const out: NormalizedLocation = { raw, city: "", country: "", remote: false, confidence: "low" };
  if (!raw) return out;

  out.remote = REMOTE_RE.test(raw);
  const hybrid = HYBRID_RE.test(raw);

  // 1) Explicit country field, if it is one we know. A 2-letter code that is
  //    also a US state ("IL", "CA") is provisional until we've seen the city.
  const countryFromField = rawCountry && !JUNK_RE.test(rawCountry) ? matchCountry(rawCountry) : null;
  const countryFieldAmbiguous = !!countryFromField && rawCountry.length === 2 && AMBIGUOUS_STATE_CODES.has(rawCountry.toLowerCase());
  if (countryFromField) out.country = countryFromField;

  // 2) Multi-location strings: use the first location only.
  const first = title(raw.split(MULTI_SPLIT)[0] || "");
  // Tokens: "Israel - Hybrid (3 days/week)" → ["Israel", "Hybrid", "3 days/week"]
  const clean = (t: string) =>
    title(t)
      .replace(/\b(remote|hybrid|on[\s-]?site|office|hq|headquarters|anywhere|work from home|wfh|friendly|travel[\s-]?required|select locations|all locations|only)\b/gi, "")
      .replace(/[()]/g, "")
      .replace(/^[-–—:\s]+|[-–—:\s]+$/g, "")
      // "in the US", "within Canada", "based in Berlin", "from the US" → the place itself
      .replace(/^(?:(?:in|within|across|based|the|located|from|near)\s+)+/i, "")
      .trim();
  const tokens = first
    .split(TOKEN_SPLIT)
    .map(clean)
    // "US-Remote", "Remote-US", "US-NYC": split hyphenated codes, but only when
    // the whole token is not itself a known name (keeps "Tel Aviv-Yafo" intact).
    .flatMap((t) => {
      const k = t.toLowerCase();
      if (IL_CITIES[k] || WORLD_CITIES[k] || COUNTRY_ALIASES[k]) return [t];
      // "US-New York" → ["US", "New York"]
      const m = t.match(/^(us|usa|uk|ca|il)-(.+)$/i);
      if (m) return [m[1], clean(m[2])];
      if (!t.includes("-") || t.includes(" ")) return [t];
      return t.split("-").map(clean);
    })
    // "US FL Miami" → ["US", "FL", "Miami"], "Toronto Canada" → ["Toronto", "Canada"]
    .flatMap((t) => {
      const k = t.toLowerCase();
      if (!t.includes(" ") || IL_CITIES[k] || WORLD_CITIES[k] || COUNTRY_ALIASES[k] || AREA_WORDS.has(k) || US_STATES[k]) return [t];
      const words = t.split(" ");
      const out: string[] = [];
      while (words.length > 1 && (matchCountry(words[0]) || (words[0] === words[0].toUpperCase() && US_STATES[words[0].toLowerCase()]))) out.push(words.shift()!);
      const tail: string[] = [];
      while (words.length > 1 && matchCountry(words[words.length - 1])) tail.unshift(words.pop()!);
      return [...out, words.join(" "), ...tail];
    })
    .filter((t) => t.length >= 2 && !JUNK_RE.test(t) && !/^\d+\s*days?/i.test(t));

  let city = "";
  let region: string | undefined;
  let cityCountry = ""; // country implied by a recognised city
  let areaSeen = false; // an area word is a positive "no city here"

  for (const tok of tokens) {
    const k = tok.toLowerCase();
    if (AREA_WORDS.has(k)) {
      areaSeen = true;
      // Country-ish area words still tell us the country ("Central US" → US).
      const c = matchCountry(tok) ?? tok.split(/\s+/).map(matchCountry).find(Boolean) ?? null;
      if (c && !out.country) out.country = c;
      continue;
    }
    if (IL_CITIES[k]) { if (!city) city = IL_CITIES[k]; cityCountry = "Israel"; continue; }
    if (IL_REGIONS[tok]) { region = IL_REGIONS[tok]; cityCountry = cityCountry || "Israel"; continue; }
    if (WORLD_CITIES[k]) { if (!city) city = WORLD_CITIES[k][0]; cityCountry = cityCountry || WORLD_CITIES[k][1]; continue; }
    const c = matchCountry(tok);
    // "IL"/"IN"/"DE"... are country codes unless we already know we're in the US.
    if (c && !(AMBIGUOUS_STATE_CODES.has(k) && (out.country === "United States" || cityCountry === "United States") && tok.length === 2)) {
      if (!out.country) out.country = c;
      continue;
    }
    // A state name, a postal code in a US context, or a bare upper-case postal
    // code that is not a country we know ("AL", "AZ", "CT", "DC").
    if (US_STATES[k] && (tok.length > 2 || out.country === "United States" || cityCountry === "United States" || (tok === tok.toUpperCase() && !matchCountry(tok) && !out.country && !cityCountry))) {
      region = region ?? US_STATES[k];
      cityCountry = cityCountry || "United States";
      continue;
    }
    if (CA_PROVINCES[k] && (tok.length > 2 || out.country === "Canada" || cityCountry === "Canada")) {
      region = region ?? CA_PROVINCES[k];
      cityCountry = cityCountry || "Canada";
      continue;
    }
    if (STREET_RE.test(tok)) continue; // an address line, not a city
    if (!city && tok.length <= 40 && /[\p{L}]/u.test(tok)) city = tok;
  }

  // "Chicago, IL": the city says United States, so IL was Illinois, not Israel.
  if (countryFieldAmbiguous && cityCountry === "United States") {
    out.country = "United States";
    region = region ?? US_STATES[rawCountry.toLowerCase()];
  }
  if (!out.country) out.country = cityCountry;
  if (!out.country && region && Object.values(IL_REGIONS).includes(region)) out.country = "Israel";
  if (region) out.region = region;
  // A bare state name ("Arizona") is a region, not a city — unless it is also
  // a real city we recognise ("New York", "Washington").
  if (city && US_STATES[city.toLowerCase()] && !WORLD_CITIES[city.toLowerCase()] && out.country === "United States") {
    if (!region) out.region = US_STATES[city.toLowerCase()];
    city = "";
  }
  // A token equal to the country is not a city.
  if (city && matchCountry(city) === out.country) city = "";
  // Unknown Latin cities get title case so "karmiel"/"KARMIEL" collapse into one facet.
  if (city && !IL_CITIES[city.toLowerCase()] && !WORLD_CITIES[city.toLowerCase()] && /^[\p{Script=Latin}\s'.-]+$/u.test(city)) city = titleCase(city);
  out.city = city;

  // Confidence: both resolved → high; country only → medium; nothing but remote/hybrid text → low.
  const cityKnown = !!city && (!!IL_CITIES[city.toLowerCase()] || !!WORLD_CITIES[city.toLowerCase()]);
  if (out.country && (cityKnown || !city)) out.confidence = "high";
  else if (out.country) out.confidence = "medium";
  else if (out.remote || hybrid || (areaSeen && !city)) out.confidence = "medium"; // "Remote"/"EMEA" alone is a complete answer
  else out.confidence = "low";
  return out;
}

/** Canonical country for a bare string ("il" → "Israel"), or "" if unknown. */
export function canonicalCountry(s: string): string {
  return matchCountry(title(s)) ?? "";
}
