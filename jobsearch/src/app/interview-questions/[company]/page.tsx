import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { after } from "next/server";
import { questionBank, type BankQuestion } from "@/app/lib/outcomes/questions";
import { ensureWebQuestions, webQuestionsDue, companyNameForKey } from "@/app/lib/interview/webQuestions";
import { verifyJwt } from "@/app/lib/jwt";
import { breadcrumbJsonLd, faqJsonLd } from "@/app/lib/seo/jsonld";
import CompanyLogo from "@/app/components/CompanyLogo";

export const dynamic = "force-dynamic"; // the signed-in view differs from the public one

type Params = Promise<{ company: string }>;

/** How many questions per stage anyone can read; the rest is for signed-in users (SEO + brand, full value inside). */
export const PUBLIC_PER_STAGE = 3;
const STAGE_TITLE: Record<string, string> = { hr: "שיחת HR", technical: "ראיון טכני", final: "ראיון סופי", other: "שאלות נוספות" };
const STAGE_ORDER = ["hr", "technical", "final", "other"];

async function signedInUserId(): Promise<string | null> {
  try {
    const token = (await cookies()).get("token")?.value;
    if (!token) return null;
    const p = await verifyJwt<{ id?: string }>(token);
    return p?.id || null;
  } catch {
    return null;
  }
}

/**
 * The bank for a company slug. A company from our catalog that nobody has
 * reported on yet gets its first web harvest right here (one search, ~15s,
 * once a month); a stale harvest is refreshed after the response is sent.
 */
async function loadBank(key: string, userId: string | null) {
  let bank = await questionBank(key, { limit: 300, userId: userId || undefined });
  if (bank.total === 0) {
    const name = await companyNameForKey(key);
    if (name && (await webQuestionsDue(name))) {
      await ensureWebQuestions(name);
      bank = await questionBank(key, { limit: 300, userId: userId || undefined });
    }
  } else if (await webQuestionsDue(bank.company)) {
    const name = bank.company;
    after(() => ensureWebQuestions(name));
  }
  return bank;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { company } = await params;
  const bank = await questionBank(decodeURIComponent(company), { limit: 1 }).catch(() => null);
  if (!bank || bank.total === 0) return { title: "אין עדיין שאלות לחברה הזו", robots: { index: false } };
  const title = `שאלות ראיון ב-${bank.company} — ${bank.total} שאלות אמיתיות מראיונות HR וטכניים`;
  const description = `מה שואלים בראיון ב-${bank.company}? ${bank.total} שאלות לפי שלב ונושא: ${bank.reported > 0 ? `${bank.reported} דווחו על ידי ${bank.reporters} מועמדי JobMatch אחרי ראיונות אמיתיים` : ""}${bank.reported > 0 && bank.webCount > 0 ? ", " : ""}${bank.webCount > 0 ? `${bank.webCount} נאספו מדיווחים פומביים ברשת` : ""}. חלק פתוח לכולם, המאגר המלא למשתמשי JobMatch.`;
  return { title, description, alternates: { canonical: `/interview-questions/${company}` }, openGraph: { title, description, url: `/interview-questions/${company}`, type: "article" }, robots: { index: true, follow: true } };
}

/** Group by stage; for anonymous readers keep PUBLIC_PER_STAGE per stage and report how many are hidden. */
export function splitForReader(questions: BankQuestion[], signedIn: boolean): { stage: string; shown: BankQuestion[]; hidden: number }[] {
  const by = new Map<string, BankQuestion[]>();
  for (const q of questions) by.set(q.stage, [...(by.get(q.stage) || []), q]);
  return STAGE_ORDER.filter((s) => by.has(s)).map((stage) => {
    const all = by.get(stage)!;
    const shown = signedIn ? all : all.slice(0, PUBLIC_PER_STAGE);
    return { stage, shown, hidden: all.length - shown.length };
  });
}

function Provenance({ q }: { q: BankQuestion }) {
  const src = q.sources.find((s) => s.url) || q.sources[0];
  return (
    <div className="jm-muted flex flex-wrap items-center gap-x-1.5">
      {q.topic && <span>{q.topic} ·</span>}
      {q.count > 0 && <span className="inline-flex items-center gap-1 text-teal">● {q.count > 1 ? `דווח על ידי ${q.count} מועמדי JobMatch` : "דווח על ידי מועמד/ת JobMatch"}</span>}
      {q.count > 0 && q.web > 0 && <span>·</span>}
      {q.web > 0 && (
        <span className="inline-flex items-center gap-1">
          <span className="text-sky">◆</span> מהרשת
          {src?.name && (src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">({src.name})</a> : <span>({src.name})</span>)}
          {q.web > 1 && <span>+{q.web - 1}</span>}
        </span>
      )}
      {q.roleTitles.length > 0 && <span>· {q.roleTitles.slice(0, 2).join(", ")}</span>}
    </div>
  );
}

export default async function CompanyQuestionsPage({ params }: { params: Params }) {
  const { company } = await params;
  const key = decodeURIComponent(company);
  const userId = await signedInUserId();
  const bank = await loadBank(key, userId);
  if (bank.total === 0) notFound();
  const groups = splitForReader(bank.questions, !!userId);
  const hidden = groups.reduce((s, g) => s + g.hidden, 0);
  const publicQs = groups.flatMap((g) => g.shown).slice(0, 12);
  const topics = [...new Set(bank.questions.map((q) => q.topic).filter(Boolean))].slice(0, 12);
  const jsonLd = [
    breadcrumbJsonLd([{ name: "שאלות ראיון", path: "/interview-questions" }, { name: bank.company, path: `/interview-questions/${company}` }]),
    faqJsonLd(publicQs.map((q) => ({ question: q.question, answer: `נשאל ב${STAGE_TITLE[q.stage] || "ראיון"} ב-${bank.company}${q.topic ? ` (נושא: ${q.topic})` : ""}${q.count > 1 ? `, דווח על ידי ${q.count} מועמדים` : q.count === 0 ? ", לפי דיווחים פומביים ברשת" : ""}. הכנה מלאה לשאלה הזו — עם המראיין הקולי של JobMatch.` }))),
  ];
  const sourceParts = [
    bank.reported > 0 && `${bank.reported} דווחו על ידי ${bank.reporters} ${bank.reporters === 1 ? "מועמד/ת" : "מועמדים"} של JobMatch אחרי ראיונות אמיתיים`,
    bank.webCount > 0 && `${bank.webCount} נאספו מדיווחים פומביים ברשת (Glassdoor, Reddit, בלוגים ופורומים)`,
  ].filter(Boolean) as string[];

  return (
    <div className="jm-page" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/interview-questions" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">← כל החברות</Link>
      <header className="mt-4 mb-6 flex items-start gap-4">
        <CompanyLogo name={bank.company} className="w-14 h-14 flex-shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h1 className="jm-title">שאלות ראיון ב-{bank.company}</h1>
          <p className="jm-subtitle">{bank.total} שאלות: {sourceParts.join("; ")}. אנונימי לחלוטין.</p>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {topics.map((t) => <span key={t} className="jm-chip jm-chip-sky">{t}</span>)}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.stage} className="jm-card p-5 sm:p-6">
              <h2 className="jm-h2 mb-3">{STAGE_TITLE[g.stage] || g.stage} <span className="jm-muted font-normal">· {g.shown.length + g.hidden} שאלות</span></h2>
              <ol className="space-y-3 list-decimal ps-5">
                {g.shown.map((q, i) => (
                  <li key={i} className="text-ink">
                    <div className="font-medium text-navy" dir="auto">{q.question}</div>
                    <Provenance q={q} />
                  </li>
                ))}
              </ol>
              {g.hidden > 0 && (
                <div className="mt-4 rounded-control border border-dashed border-line p-4 text-center space-y-2 bg-canvas">
                  <p className="text-sm text-ink-600">עוד {g.hidden} שאלות מה{STAGE_TITLE[g.stage]} ב-{bank.company} למשתמשי JobMatch.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href={`/Login?next=${encodeURIComponent(`/interview-questions/${company}`)}`} className="jm-btn jm-btn-primary jm-btn-sm">התחברות</Link>
                    <Link href="/SignUp" className="jm-btn jm-btn-secondary jm-btn-sm">הרשמה חינם</Link>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="jm-card p-5 space-y-3">
            <h3 className="jm-h2 text-base">להתאמן על זה בקול</h3>
            <p className="text-sm text-ink-600 leading-relaxed">המראיין של JobMatch מכיר את {bank.company} ואת השאלות האלה, ומנהל איתך ראיון אמיתי — בשיחה, לא בצ&apos;אט — עם משוב בסוף.</p>
            <Link href={`/?company=${encodeURIComponent(bank.company)}`} className="jm-btn jm-btn-primary w-full">משרות פתוחות ב-{bank.company}</Link>
            {!userId && <p className="jm-muted text-center">{hidden > 0 ? `${hidden} שאלות נוספות אחרי התחברות` : "ההכנה המלאה למשתמשים רשומים"}</p>}
          </section>
          <section className="jm-card p-5 space-y-2">
            <h3 className="jm-h2 text-base">מאיפה השאלות</h3>
            <p className="text-sm text-ink-600 leading-relaxed"><span className="text-teal">●</span> אחרי כל ראיון אמיתי JobMatch שואל את המועמד/ת &quot;מה שאלו?&quot;. התשובות נשמרות בלי פרטים מזהים.</p>
            <p className="text-sm text-ink-600 leading-relaxed"><span className="text-sky">◆</span> בנוסף, סוכן מחקר סורק פעם בחודש דיווחים פומביים על ראיונות בחברה (Glassdoor, Reddit, Blind, בלוגים ופורומים בעברית) ומוסיף רק שאלות שדווחו שם במפורש, עם קישור למקור.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
