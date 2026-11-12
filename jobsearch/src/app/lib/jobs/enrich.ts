/**
 * Structured fields out of a posting's text, by rules (no model, no cost):
 *   - years of experience required (min/max), from phrases like "3+ years",
 *     "2-5 years of experience", "at least 4 years", "שנתיים ניסיון", "5 שנות ניסיון";
 *   - technologies mentioned, from a dictionary of ~150 names with aliases;
 *   - the requirements list, from the bullets under a "Requirements"-like heading.
 * The scout runs it on every new posting; /api/scout/enrich backfills.
 */

export type Experience = { min: number; max: number | null };
export type Enrichment = { experienceMin: number | null; experienceMax: number | null; tech: string[]; requirements: string[]; /** A tech-industry role (engineering, data, product, design, IT…) as opposed to nursing, sales, claims… — the default listing shows only these. */ techRole: boolean };

// ---------------------------------------------------------------- tech role

const TECH_TITLE_RE =
  /\b(engineer(?:ing)?|developer|software development|web development|programmer|software|architect|devops|sre|site reliability|qa|quality assurance|test(?:er|ing)?|automation|data(?: scientist| engineer| analyst| science)?|machine learning|ml|ai|nlp|computer vision|algorithm|research(?:er)?|scientist|frontend|front-end|backend|back-end|full[- ]?stack|web|mobile|ios|android|embedded|firmware|fpga|asic|vlsi|hardware|chip|silicon|verification|validation|cloud|security|cyber|infosec|network|sysadmin|system administrator|it\b|helpdesk|help desk|technical|solutions?|product (?:manager|owner|lead|analyst)|ux|ui|designer|technical writer|scrum master|project manager|program manager|delivery manager|cto|r&d|bi\b|analytics|database|dba|platform|infrastructure|integration|implementation|gis|robotics|simulation|signal processing|physicist|mathematician|statistician|bioinformatic|crypto|blockchain|game|unity|unreal|3d|graphics|rf\b|optics|electrical|electronics|mechanical|mechatronic|systems?|control|pcb|layout|cad|plm|erp|sap|salesforce|crm|low[- ]code|no[- ]code|tech lead|team lead(?:er)?|technologist|student|intern)\b|מפתח|מתכנת|מהנדס|בודק|אוטומצי|דאטה|נתונים|אלגורית|ארכיטקט|מנהל\/?ת? מוצר|מעצב|סייבר|אבטחת מידע|תמיכה טכנית|טכנולוג|מערכות|חומרה|תוכנה|אנליסט|סטודנט|מתמחה/i;
const NON_TECH_TITLE_RE =
  /\b(nurse|nursing|physician|doctor|dentist|pharmac|therapist|caregiver|social worker|sales|account executive|account manager|business development|sdr|bdr|recruit|talent acquisition|sourcer|hr\b|human resources|people partner|payroll|bookkeep|accountant|accounting|finance|financial|controller|treasury|tax\b|legal|lawyer|attorney|paralegal|compliance|marketing|content (?:writer|creator|manager)|copywriter|social media|community manager|influencer|brand|pr\b|public relations|customer (?:success|support|service|care|experience)|call center|claims|underwrit|insurance|actuar|scheduler|driver|courier|warehouse|logistics|procurement|buyer|purchasing|office manager|receptionist|administrative|admin(?:istrative)? assistant|executive assistant|facilities|janitor|cleaner|chef|cook|barista|cashier|retail|store manager|teacher|tutor|coach|trainer|wholesale|merchandis|video editor|photographer|event|hospitality|security guard|guard|operations manager|operations lead|revenue|partnerships?|channel partner|collections?|credit|loan|mortgage|real estate|property|travel|flight|crew)\b|אח\/ות|אחות|אח\b|רופא|מכירות|אקאונט|גיוס|משאבי אנוש|הנהלת חשבונות|חשב\b|כספים|שיווק|שירות לקוחות|תביעות|ביטוח|נהג|מחסן|רכש|מזכיר|קופאי|מורה|מאבטח|אופרטיבי|שיווק|מכירה/i;

/**
 * Is this a tech-industry role? The title decides when it says so either way
 * ("Backend Engineer" yes, "Claims Specialist" no — a tech word wins over a
 * non-tech one, so "Sales Engineer" stays in); a title with no signal counts
 * as tech when the posting names at least two technologies.
 */
export function isTechRole(title: string, tech: string[] = []): boolean {
  const t = title || "";
  if (TECH_TITLE_RE.test(t)) return true;
  if (NON_TECH_TITLE_RE.test(t)) return false;
  return tech.length >= 2;
}

/** Filter buckets, by the required minimum. */
export const EXPERIENCE_BUCKETS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "0-2", label: "0-2 years", min: 0, max: 2 },
  { key: "3-5", label: "3-5 years", min: 3, max: 5 },
  { key: "5-10", label: "5-10 years", min: 5, max: 10 },
  { key: "10+", label: "10+ years", min: 10, max: null },
];
export const experienceBucket = (min: number | null | undefined): string | null => {
  if (min == null) return null;
  if (min <= 2) return "0-2";
  if (min <= 4) return "3-5";
  if (min < 10) return "5-10";
  return "10+";
};

// ---------------------------------------------------------------- experience

const HE_WORDS: Record<string, number> = { שנה: 1, שנתיים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10 };
const EN_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Things that look like "N years" but are not a requirement. */
const NOT_A_REQUIREMENT = /(years?\s+(old|in a row|running|ago|of (launch|operation|growth|history|business|success)))|(\d+\s*years?\s+(?:of\s+)?(?:company|track record))|(within\s+(?:just\s+)?\d+\s*years)|(founded|established|celebrat|anniversary|warranty|contract\s+of|shelf|guarantee)/i;

/** `secondary`: a part of the headline requirement ("…including 2+ years managing a team"), never the posting's bar on its own. */
type Found = { min: number; max: number | null; index: number; strong: boolean; secondary?: boolean };

/** "2+ years managing / leading / as a team lead", "of which 3 years…": a sub-requirement that qualifies another phrase. */
const SECONDARY_AFTER = /^\s*(?:of\s+)?(?:managing|leading|mentoring|supervising|as an? (?:team|tech|technical|group) lead(?:er)?|in (?:a |an )?(?:leadership|management|managerial) (?:role|position)|(?:of )?(?:people|team) management|בניהול|כמנהל|כראש צוות)/i;
const SECONDARY_BEFORE = /(?:including|incl\.|of which|out of which|of them|מתוכן|מתוכם|מהן|מהם|מתוכו)\s*(?:at least\s+|minimum\s+|לפחות\s+)?$/i;

function pushRange(out: Found[], a: string, b: string | undefined, index: number, strong: boolean, plus = false, secondary = false) {
  const min = Number(a);
  if (!Number.isFinite(min) || min > 25) return;
  let max: number | null = b !== undefined ? Number(b) : null;
  if (max !== null && (!Number.isFinite(max) || max > 30 || max < min)) max = null;
  if (plus) max = null;
  out.push({ min, max, index, strong, secondary });
}

/**
 * The required years of experience, or null. Prefers phrases that say
 * "experience"/"ניסיון" (strong), takes the first strong one in reading order
 * (the headline requirement; "including 2+ years managing" comes later).
 */
export function extractExperience(text: string): Experience | null {
  if (!text) return null;
  const found: Found[] = [];
  // "3+ years", "2-5 years", "10+ overall years", "4 שנות ניסיון"; up to two words may sit between the number and "years".
  // (\b does not work next to Hebrew letters, so the token end is checked with a lookahead.)
  const re = /(\d{1,2})\s*(?:\+|\s*(?:-|–|—|to|עד)\s*(\d{1,2}))?\+?(?:\s+(?!years?\b|yrs?\b|שנ)[a-zA-Z\u0590-\u05ff]+){0,2}\s*(?:years?|yrs?\.?|שנ(?:ים|ות|ה))(?![a-zA-Z\u0590-\u05ff])([^.\n;]{0,45})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // Exclusions look at the phrase itself and its immediate neighbours, not at an earlier sentence.
    const near = text.slice(Math.max(0, m.index - 22), m.index + m[0].length + 30);
    if (NOT_A_REQUIREMENT.test(near)) continue;
    const window = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 45);
    const strong = /experience|ניסיון|background|exposure|working (in|with)|hands[- ]on|track record|in a similar role/i.test(window);
    const plus = /^\d{1,2}\s*\+/.test(m[0]) || /\+\s*(?:years?|yrs?)/i.test(m[0]) || /ומעלה|or more|and above|at least|minimum|לפחות|מינימום/i.test(window);
    // "…including 2+ years managing a team": qualifies the headline years, it is not the bar itself.
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    const secondary = SECONDARY_AFTER.test(m[3] || "") || (SECONDARY_BEFORE.test(before) && found.length > 0);
    pushRange(found, m[1], m[2], m.index, strong, plus && m[2] === undefined, secondary);
  }
  // Written-out numbers: "two years", "שנתיים ניסיון", "שלוש שנות ניסיון", "at least five years".
  const words = new RegExp(`\\b(${[...Object.keys(EN_WORDS)].join("|")})\\s+(?:\\+\\s*)?years?\\b|(${Object.keys(HE_WORDS).join("|")})\\s*(?:שנות\\s+)?ניסיון|(?:לפחות|מינימום)\\s+(${Object.keys(HE_WORDS).join("|")})\\s+שנ`, "gi");
  while ((m = words.exec(text))) {
    const key = (m[1] || m[2] || m[3] || "").toLowerCase();
    const n = EN_WORDS[key] ?? HE_WORDS[key];
    if (n === undefined) continue;
    const window = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 45);
    if (NOT_A_REQUIREMENT.test(text.slice(Math.max(0, m.index - 22), m.index + m[0].length + 30))) continue;
    found.push({ min: n, max: null, index: m.index, strong: /experience|ניסיון/i.test(window) });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.index - b.index);
  const pick = found.find((f) => f.strong && !f.secondary) || found.find((f) => !f.secondary) || found[0];
  return { min: pick.min, max: pick.max };
}

// ---------------------------------------------------------------- technologies

/** Display name → pattern (case-insensitive unless marked). Order matters only for display. */
const TECH: [string, RegExp][] = [
  ["JavaScript", /\bjava\s?script\b|\bJS\b/i],
  ["TypeScript", /\btype\s?script\b|\bTS\b(?!\s*file)/i],
  ["React", /\breact(?:\.?js)?\b(?!\s*native)/i],
  ["React Native", /\breact\s*native\b/i],
  ["Angular", /\bangular(?:js)?\b/i],
  ["Vue", /\bvue(?:\.?js)?\b/i],
  ["Next.js", /\bnext\.?js\b/i],
  ["Node.js", /\bnode(?:\.?js)?\b/i],
  ["NestJS", /\bnest\.?js\b/i],
  ["Express", /\bexpress(?:\.?js)?\b/i],
  ["HTML", /\bhtml5?\b/i],
  ["CSS", /\bcss3?\b|\bsass\b|\bscss\b|\btailwind\b/i],
  ["GraphQL", /\bgraphql\b/i],
  ["REST", /\brest(?:ful)?\s*apis?\b|\bREST\b/],
  ["gRPC", /\bgrpc\b/i],
  ["WebSockets", /\bweb\s?sockets?\b/i],
  ["Python", /\bpython\b/i],
  ["Django", /\bdjango\b/i],
  ["FastAPI", /\bfast\s?api\b/i],
  ["Flask", /\bflask\b/i],
  ["Java", /\bjava\b(?!\s*script)/i],
  ["Spring", /\bspring\s*(?:boot|framework)?\b/i],
  ["Kotlin", /\bkotlin\b/i],
  ["Scala", /\bscala\b/i],
  ["Go", /\bGolang\b|(?<=[(/,]\s*)Go\b|\bGo(?=\s*[)/,]|\s+(?:lang|programming|developer|engineer|services|microservices|backend))/],
  ["Rust", /\brust\b/i],
  ["C++", /\bc\+\+/i],
  ["C#", /\bc#|\bc-sharp\b/i],
  [".NET", /\.net\b|\bdotnet\b|\basp\.net\b/i],
  ["PHP", /\bPHP\b/],
  ["Ruby", /\bruby\b/i],
  ["Rails", /\brails\b/i],
  ["Swift", /\bswift\b(?!\s*(code|payment|transfer))/i],
  ["Objective-C", /\bobjective[- ]c\b/i],
  ["iOS", /\biOS\b/],
  ["Android", /\bandroid\b/i],
  ["Flutter", /\bflutter\b/i],
  ["SQL", /\bsql\b/i],
  ["PostgreSQL", /\bpostgres(?:ql)?\b/i],
  ["MySQL", /\bmysql\b|\bmariadb\b/i],
  ["MongoDB", /\bmongo(?:db)?\b/i],
  ["Redis", /\bredis\b/i],
  ["Elasticsearch", /\belastic\s?search\b|\bopensearch\b/i],
  ["Kafka", /\bkafka\b/i],
  ["RabbitMQ", /\brabbitmq\b/i],
  ["Spark", /\bspark\b/i],
  ["Hadoop", /\bhadoop\b/i],
  ["Airflow", /\bairflow\b/i],
  ["dbt", /\bdbt\b/],
  ["Snowflake", /\bsnowflake\b/i],
  ["BigQuery", /\bbig\s?query\b/i],
  ["Databricks", /\bdatabricks\b/i],
  ["Pandas", /\bpandas\b/i],
  ["NumPy", /\bnumpy\b/i],
  ["TensorFlow", /\btensor\s?flow\b/i],
  ["PyTorch", /\bpytorch\b/i],
  ["scikit-learn", /\bscikit[- ]learn\b|\bsklearn\b/i],
  ["Machine Learning", /\bmachine[- ]learning\b|\bML\b/],
  ["Deep Learning", /\bdeep[- ]learning\b/i],
  ["NLP", /\bNLP\b|\bnatural language processing\b/i],
  ["Computer Vision", /\bcomputer vision\b/i],
  ["LLM", /\bLLMs?\b|\blarge language models?\b|\bGenAI\b|\bgenerative AI\b/i],
  ["LangChain", /\blangchain\b/i],
  ["OpenAI", /\bopenai\b|\bGPT-?\d/i],
  ["Hugging Face", /\bhugging\s?face\b/i],
  ["RAG", /\bRAG\b|\bretrieval[- ]augmented\b/],
  ["AWS", /\bAWS\b|\bamazon web services\b/],
  ["Azure", /\bazure\b/i],
  ["GCP", /\bGCP\b|\bgoogle cloud\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b|\bEKS\b|\bGKE\b|\bAKS\b/i],
  ["Docker", /\bdocker\b/i],
  ["Terraform", /\bterraform\b/i],
  ["Ansible", /\bansible\b/i],
  ["Helm", /\bhelm\b/i],
  ["ArgoCD", /\bargo\s?cd\b/i],
  ["Jenkins", /\bjenkins\b/i],
  ["GitHub Actions", /\bgithub actions\b/i],
  ["GitLab", /\bgitlab\b/i],
  ["CI/CD", /\bci\s*\/\s*cd\b/i],
  ["Linux", /\blinux\b|\bunix\b/i],
  ["Bash", /\bbash\b|\bshell script/i],
  ["PowerShell", /\bpowershell\b/i],
  ["Nginx", /\bnginx\b/i],
  ["Microservices", /\bmicro-?services\b/i],
  ["Serverless", /\bserverless\b|\blambda\b/i],
  ["Git", /\bgit\b(?!hub|lab)/i],
  ["Jira", /\bjira\b/i],
  ["Figma", /\bfigma\b/i],
  ["Salesforce", /\bsalesforce\b/i],
  ["SAP", /\bSAP\b/],
  ["Tableau", /\btableau\b/i],
  ["Power BI", /\bpower\s?bi\b/i],
  ["Looker", /\blooker\b/i],
  ["Excel", /\b(?:ms|microsoft)\s+excel\b|\bexcel\s+(?:skills|spreadsheets?|pivot|macros?|vlookup|formulas)/i],
  ["Verilog", /\bverilog\b|\bsystem\s?verilog\b/i],
  ["VHDL", /\bvhdl\b/i],
  ["FPGA", /\bfpga\b/i],
  ["RTL", /\bRTL\b/],
  ["UVM", /\bUVM\b/],
  ["ASIC", /\bASIC\b/],
  ["Embedded", /\bembedded\b/i],
  ["RTOS", /\bRTOS\b|\bfreertos\b/i],
  ["MATLAB", /\bmatlab\b|\bsimulink\b/i],
  ["LabVIEW", /\blabview\b/i],
  ["Selenium", /\bselenium\b/i],
  ["Playwright", /\bplaywright\b/i],
  ["Cypress", /\bcypress\b/i],
  ["Appium", /\bappium\b/i],
  ["Pytest", /\bpytest\b/i],
  ["JUnit", /\bjunit\b/i],
  ["Postman", /\bpostman\b/i],
  ["Splunk", /\bsplunk\b/i],
  ["Datadog", /\bdatadog\b/i],
  ["Grafana", /\bgrafana\b|\bprometheus\b/i],
  ["ELK", /\bELK\b|\bkibana\b|\blogstash\b/i],
  ["Firebase", /\bfirebase\b/i],
  ["Unity", /\bunity\s*3?d?\b/i],
  ["Unreal", /\bunreal\b/i],
  ["Photoshop", /\bphotoshop\b/i],
  ["Illustrator", /\billustrator\b/i],
  ["After Effects", /\bafter effects\b/i],
  ["Google Analytics", /\bgoogle analytics\b|\bGA4\b/i],
  ["HubSpot", /\bhubspot\b/i],
  ["SIEM", /\bSIEM\b/],
  ["SOC", /\bSOC\b(?!\s*2)/],
  ["Penetration Testing", /\bpen(?:etration)?[- ]test/i],
  ["Networking", /\bTCP\/IP\b|\bnetwork protocols?\b|\bCCNA\b|\bCCNP\b|\bBGP\b|\bOSPF\b/i],
  ["Active Directory", /\bactive directory\b/i],
  ["OAuth", /\boauth\b|\bopenid\b|\bSAML\b/i],
  ["Oracle", /\boracle\b/i],
  ["Cloudflare", /\bcloudflare\b/i],
  ["Supabase", /\bsupabase\b/i],
  ["Three.js", /\bthree\.?js\b|\bwebgl\b/i],
  ["Electron", /\belectron\b/i],
  ["Qt", /\bQt\b/],
  ["CUDA", /\bCUDA\b/],
  ["OpenCV", /\bopencv\b/i],
  ["ROS", /\bROS\b2?/],
];

/** Technologies named in the text, title first, each once, at most `max`. */
export function extractTech(title: string, description: string, max = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const scan = (text: string) => {
    if (!text) return;
    for (const [name, re] of TECH) {
      if (seen.has(name)) continue;
      if (re.test(text)) {
        seen.add(name);
        out.push(name);
      }
    }
  };
  scan(title || "");
  scan(description || "");
  // "React Native" implies React was matched by the native phrase only when both appear; keep both — they are different jobs.
  return out.slice(0, max);
}

// ---------------------------------------------------------------- requirements

const REQ_HEADING = /^(?:[-•*#\s]*)(requirements?|qualifications?|what you(?:'|’| wi)ll (?:need|bring)|what we(?:'|’| a)re looking for|who you are|must[- ]haves?|skills?(?: (?:&|and) (?:experience|qualifications))?|your profile|about you|you have|minimum qualifications|basic qualifications|דרישות(?: התפקיד| המשרה)?|מה אנחנו מחפשים|כישורים(?: נדרשים)?|מי את\/ה|תנאי סף)\s*[:：\-–]?\s*$/i;
const STOP_HEADING = /^(?:[-•*#\s]*)(nice to have|preferred|advantages?|bonus|benefits|what we offer|about (?:us|the company|the role|the team)|responsibilities|what you(?:'|’| wi)ll do|the role|why (?:join|us)|יתרון|יתרונות|אחריות|תחומי אחריות|מה נציע|על החברה|תיאור התפקיד)(?!\p{L})/iu;
const BULLET = /^\s*(?:[-•*·▪◦✔✓►➢→]|\d+[.)])\s*/;

/** The requirement bullets under a requirements heading; else the first bullets that read like requirements. */
export function extractRequirements(description: string, max = 6): string[] {
  if (!description) return [];
  const lines = description.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const take = (from: number): string[] => {
    const items: string[] = [];
    for (let i = from; i < lines.length && items.length < max; i++) {
      const l = lines[i];
      if (!l) {
        if (items.length) {
          // a blank line ends the list only when the next non-blank line is not a bullet
          const next = lines.slice(i + 1).find((x) => x);
          if (!next || !BULLET.test(next)) break;
        }
        continue;
      }
      if (STOP_HEADING.test(l) || REQ_HEADING.test(l)) break;
      if (BULLET.test(l)) {
        const item = trimItem(l.replace(BULLET, ""));
        if (item && !/:$/.test(item) && item.length >= 2) items.push(item); // "Required:" is a label, not a requirement
      }
      else if (/:$/.test(l) && l.length <= 60) continue; // "Required:" / "Must have:" — a label inside the list
      else if (!items.length && l.length <= 160 && lines[i + 1] && BULLET.test(lines[i + 1] || "")) continue; // sub-heading
      else if (items.length) break;
      else if (l.length <= 160) items.push(trimItem(l)); // first line right after the heading, unbulleted
    }
    return items.filter(Boolean);
  };
  const headingAt = lines.findIndex((l) => REQ_HEADING.test(l));
  if (headingAt >= 0) {
    const items = take(headingAt + 1);
    if (items.length) return items;
  }
  // Fallback: bullets anywhere that mention experience / knowledge / a degree.
  const likely = lines.filter((l) => BULLET.test(l) && /experience|years|degree|knowledge|proficien|familiar|ניסיון|תואר|ידע|היכרות|שליטה/i.test(l)).map((l) => trimItem(l.replace(BULLET, "")));
  return likely.slice(0, max);
}

const trimItem = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 137).replace(/\s+\S*$/, "") + "…" : t;
};

/** Everything at once, for the scout and the backfill. */
export function enrich(title: string, description: string): Enrichment {
  const exp = extractExperience(description || "");
  const tech = extractTech(title, description);
  return {
    experienceMin: exp ? exp.min : null,
    experienceMax: exp ? exp.max : null,
    tech,
    techRole: isTechRole(title, tech),
    requirements: extractRequirements(description),
  };
}

/** A key for "the same posting again": company + normalised title (for repost detection). */
export function titleKey(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(m\/f|f\/m|h\/f|w\/m|all genders|\d{3,})\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}
