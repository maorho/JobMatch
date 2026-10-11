import type { Metadata } from "next";
import Link from "next/link";
import { companiesWithQuestions } from "@/app/lib/outcomes/questions";
import { breadcrumbJsonLd } from "@/app/lib/seo/jsonld";
import CompanyLogo from "@/app/components/CompanyLogo";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "שאלות ראיון לפי חברה — מה באמת שואלים בראיונות הייטק בישראל",
  description: "מאגר שאלות ראיון אמיתיות שדווחו על ידי מועמדים אחרי ראיונות HR, טכניים וסופיים בחברות הייטק בישראל. לפי חברה, שלב ונושא.",
  alternates: { canonical: "/interview-questions" },
  openGraph: { title: "שאלות ראיון לפי חברה | JobMatch", description: "מה באמת שואלים בראיונות — דיווחים של מועמדים, לפי חברה ושלב.", url: "/interview-questions", type: "website" },
};

/** Public index of the per-company interview-question bank (SEO entry point). */
export default async function InterviewQuestionsIndex() {
  const companies = await companiesWithQuestions(500).catch(() => []);
  const total = companies.reduce((s, c) => s + c.questions, 0);
  const jsonLd = [breadcrumbJsonLd([{ name: "שאלות ראיון", path: "/interview-questions" }])];
  return (
    <div className="jm-page" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mb-6 sm:mb-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">מאגר שאלות ראיון</div>
        <h1 className="jm-title">מה באמת שואלים בראיונות?</h1>
        <p className="jm-subtitle">
          {total > 0 ? `${total.toLocaleString()} שאלות אמיתיות מ-${companies.length} חברות, ` : ""}
          דיווחים אנונימיים של מועמדי JobMatch אחרי ראיונות HR, טכניים וסופיים. חלק מהשאלות פתוחות לכולם; משתמשים רשומים רואים את המאגר המלא ומתאמנים עליו עם המראיין הקולי.
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="jm-card p-8 text-center space-y-3">
          <div className="text-3xl">🗂️</div>
          <p className="text-ink-600">המאגר מתמלא מדיווחי מועמדים אחרי ראיונות אמיתיים. הראשונים יופיעו כאן בקרוב.</p>
          <Link href="/SignUp" className="jm-btn jm-btn-primary">הצטרפות ל-JobMatch</Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.companyKey}>
              <Link href={`/interview-questions/${encodeURIComponent(c.companyKey)}`} className="jm-card p-4 flex items-center gap-3 hover:border-teal transition-colors">
                <CompanyLogo name={c.company} className="w-10 h-10 flex-shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-navy truncate">{c.company}</div>
                  <div className="jm-muted">
                    {c.questions} שאלות · {c.reporters} {c.reporters === 1 ? "מדווח/ת" : "מדווחים"} · עודכן {new Date(c.lastAskedAt).toLocaleDateString("he-IL")}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="jm-card p-5 sm:p-6 mt-8 space-y-2">
        <h2 className="jm-h2">איך זה עובד</h2>
        <p className="text-sm text-ink-600 leading-relaxed">
          אחרי כל ראיון אמיתי JobMatch שואל את המועמד/ת &quot;מה שאלו?&quot;. הטקסט החופשי הופך לשאלות מסודרות לפי שלב ונושא, בלי פרטים מזהים. השאלות מזינות את תוכניות ההכנה ואת המראיין המדומה — כך שמי שמתאמן ל-{companies[0]?.company || "חברה"} מתאמן על מה שבאמת נשאל שם.
        </p>
      </section>
    </div>
  );
}
