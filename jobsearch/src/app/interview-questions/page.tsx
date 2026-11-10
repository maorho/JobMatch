import type { Metadata } from "next";
import { companiesWithQuestions } from "@/app/lib/outcomes/questions";
import { breadcrumbJsonLd } from "@/app/lib/seo/jsonld";
import BankIndexView from "./BankIndexView";

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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BankIndexView total={total} companies={companies.map((c) => ({ ...c, lastAskedAt: new Date(c.lastAskedAt).toISOString() }))} />
    </>
  );
}
