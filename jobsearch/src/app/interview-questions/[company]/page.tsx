import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { after } from "next/server";
import { questionBank, type BankQuestion } from "@/app/lib/outcomes/questions";
import { ensureWebQuestions, webQuestionsStatus, webQuestionsAvailable, claimWebQuestionsHarvest, companyNameForKey } from "@/app/lib/interview/webQuestions";
import { getUserIdFromToken } from "@/app/lib/getUserIdFromRequest";
import { breadcrumbJsonLd, faqJsonLd } from "@/app/lib/seo/jsonld";
import CompanyBankView, { HarvestingView, type BankQuestionJson } from "./CompanyBankView";

export const dynamic = "force-dynamic"; // the signed-in view differs from the public one

type Params = Promise<{ company: string }>;

/** How many questions per stage anyone can read; the rest is for signed-in users (SEO + brand, full value inside). */
export const PUBLIC_PER_STAGE = 3;
/** Hebrew stage names for the JSON-LD / metadata (which, like `metadata`, cannot follow the client language). */
const STAGE_TITLE: Record<string, string> = { hr: "שיחת HR", technical: "ראיון טכני", final: "ראיון סופי", other: "שאלות נוספות" };
const STAGE_ORDER = ["hr", "technical", "final", "other"];

async function signedInUserId(): Promise<string | null> {
  try {
    // Revocation-aware (deleted user / changed password), not just a signature check.
    return await getUserIdFromToken((await cookies()).get("token")?.value);
  } catch {
    return null;
  }
}

/**
 * The bank for a company slug. A company from our catalog that nobody has
 * reported on yet gets its first web harvest kicked off in `after()` (the
 * search takes ~15s; the request must not wait for it) and the page renders a
 * "collecting…" state; a stale harvest is likewise refreshed after the
 * response is sent.
 *
 * "collecting…" is shown only while a harvest is actually running (we just
 * claimed it, or another visit claimed it < 2 min ago). With no research
 * client, after a harvest that found nothing, or while a failed attempt is
 * backing off, an empty company falls through to notFound() — so crawlers
 * don't re-queue a paid search on every visit.
 */
async function loadBank(key: string, userId: string | null): Promise<{ bank: Awaited<ReturnType<typeof questionBank>>; harvesting: string | null }> {
  const bank = await questionBank(key, { limit: 300, userId: userId || undefined });
  const name = bank.total === 0 ? await companyNameForKey(key) : bank.company;
  if (!name || !webQuestionsAvailable()) return { bank, harvesting: null };
  const st = await webQuestionsStatus(name);
  let running = st.inFlight;
  if (st.due) {
    // Claim before the response goes out so concurrent visits don't stack
    // searches; losing the claim means another visit just started one.
    running = true;
    if (await claimWebQuestionsHarvest(name)) after(() => ensureWebQuestions(name, { claimed: true }));
  }
  return { bank, harvesting: bank.total === 0 && running ? name : null };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { company } = await params;
  const bank = await questionBank(decodeURIComponent(company), { limit: 1 }).catch(() => null);
  if (!bank || bank.total === 0) return { title: "אין עדיין שאלות לחברה הזו", robots: { index: false } };
  const title = `שאלות ראיון ב-${bank.company} — ${bank.total} שאלות אמיתיות מראיונות HR וטכניים`;
  const description = `מה שואלים בראיון ב-${bank.company}? ${bank.total} שאלות לפי שלב ונושא: ${bank.reported > 0 ? `${bank.reported} דווחו על ידי ${bank.reporters} מועמדי JobMatch אחרי ראיונות אמיתיים` : ""}${bank.reported > 0 && bank.webCount > 0 ? ", " : ""}${bank.webCount > 0 ? `${bank.webCount} נאספו מדיווחים פומביים ברשת` : ""}. חלק פתוח לכולם, המאגר המלא למשתמשי JobMatch.`;
  return {
    title,
    description,
    alternates: { canonical: `/interview-questions/${company}` },
    // Per-page openGraph replaces the root one, so the image must be repeated here.
    openGraph: { title, description, url: `/interview-questions/${company}`, type: "article", images: [{ url: "/og.png", width: 1200, height: 630, alt: "JobMatch" }] },
    robots: { index: true, follow: true },
  };
}

/** Group by stage; for anonymous readers keep PUBLIC_PER_STAGE per stage and report how many are hidden. */
export function splitForReader<Q extends { stage: string }>(questions: Q[], signedIn: boolean): { stage: string; shown: Q[]; hidden: number }[] {
  const by = new Map<string, Q[]>();
  for (const q of questions) by.set(q.stage, [...(by.get(q.stage) || []), q]);
  return STAGE_ORDER.filter((s) => by.has(s)).map((stage) => {
    const all = by.get(stage)!;
    const shown = signedIn ? all : all.slice(0, PUBLIC_PER_STAGE);
    return { stage, shown, hidden: all.length - shown.length };
  });
}

/** The client view gets plain JSON: drop the Date. */
const toJson = ({ lastAskedAt: _d, ...q }: BankQuestion): BankQuestionJson => q;

export default async function CompanyQuestionsPage({ params }: { params: Params }) {
  const { company } = await params;
  const key = decodeURIComponent(company);
  const userId = await signedInUserId();
  const { bank, harvesting } = await loadBank(key, userId);
  if (bank.total === 0 && harvesting) {
    // First visit for a catalog company: the harvest runs after this response.
    return <HarvestingView company={harvesting} slug={company} />;
  }
  if (bank.total === 0) notFound();
  const groups = splitForReader(bank.questions.map(toJson), !!userId);
  const hidden = groups.reduce((s, g) => s + g.hidden, 0);
  const publicQs = groups.flatMap((g) => g.shown).slice(0, 12);
  const topics = [...new Set(bank.questions.map((q) => q.topic).filter(Boolean))].slice(0, 12);
  const jsonLd = [
    breadcrumbJsonLd([{ name: "שאלות ראיון", path: "/interview-questions" }, { name: bank.company, path: `/interview-questions/${company}` }]),
    faqJsonLd(publicQs.map((q) => ({ question: q.question, answer: `נשאל ב${STAGE_TITLE[q.stage] || "ראיון"} ב-${bank.company}${q.topic ? ` (נושא: ${q.topic})` : ""}${q.count > 1 ? `, דווח על ידי ${q.count} מועמדים` : q.count === 0 ? ", לפי דיווחים פומביים ברשת" : ""}. הכנה מלאה לשאלה הזו — עם המראיין הקולי של JobMatch.` }))),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CompanyBankView slug={company} company={bank.company} total={bank.total} reported={bank.reported} reporters={bank.reporters} webCount={bank.webCount} groups={groups} hidden={hidden} topics={topics} signedIn={!!userId} />
    </>
  );
}
