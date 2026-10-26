import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { partnerBySlug } from "@/app/lib/partners/partners";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
const KIND_HE: Record<string, string> = { bootcamp: "בוגרי הבוטקמפ", college: "סטודנטים ובוגרים", community: "חברי הקהילה", other: "חברי התוכנית" };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await partnerBySlug(slug);
  if (!p || !p.active) return { title: "תוכנית שותפים", robots: { index: false } };
  return { title: `${p.name} × JobMatch — חיפוש עבודה עם סוכני AI ל${KIND_HE[p.kind] || "חברי התוכנית"}`, description: p.blurb || `${KIND_HE[p.kind] || "חברי"} ${p.name} מקבלים את JobMatch: התאמה למשרות, הגשה אוטומטית, ראיונות קוליים והכנה לפי חברה.`, alternates: { canonical: `/partners/${p.slug}` } };
}

/** Partner landing: what the cohort gets, and the signup link that carries the invite code. */
export default async function PartnerLanding({ params }: { params: Params }) {
  const { slug } = await params;
  const p = await partnerBySlug(slug);
  if (!p || !p.active) notFound();
  const signup = `/SignUp?ref=${encodeURIComponent(p.inviteCode)}`;
  return (
    <div className="jm-page" dir="rtl">
      <section className="jm-hero min-h-[240px] flex">
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/70">{p.name} × JobMatch</div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">{KIND_HE[p.kind] || "חברי התוכנית"} של {p.name} מחפשים עבודה עם צוות סוכני AI</h1>
          <p className="text-sm sm:text-base text-white/80">{p.blurb || "התאמה אמיתית למשרות לפי הקו״ח, הגשה אוטומטית למשרות שמתאימות, ראיון קולי עם מראיין שמכיר את החברה, והכנה לפי השאלות שבאמת נשאלות שם."}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={signup} className="jm-btn jm-btn-accent">הצטרפות עם קוד {p.inviteCode}</Link>
            <Link href="/interview-questions" className="jm-btn jm-btn-ghost text-white">מאגר שאלות הראיון</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
        {[
          ["🎯", "התאמה שמבינה רמה", "ג'וניור לא נשלח למשרת Expert. ציון 'סיכוי לראיון' שנלמד מתוצאות אמיתיות."],
          ["⚡", "הגשה אוטומטית", "קו״ח מותאמים לכל משרה וטופס ה-ATS ממולא בשבילך — רק למה שבאמת מתאים."],
          ["🎙️", "ראיון קולי אמיתי", "מראיין שמכיר את החברה, שואל מה שבאמת שואלים שם, ונותן משוב בסוף."],
          ["🔁", "לומד מכל הגשה", "'קיבלת תשובה?' אחרי כל הגשה, 'מה שאלו?' אחרי כל ראיון — וכולם מרוויחים."],
        ].map(([icon, title, text]) => (
          <div key={title} className="jm-card p-5">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-semibold text-navy">{title}</div>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      <section className="jm-card p-5 sm:p-6 mt-6 space-y-2">
        <h2 className="jm-h2">כבר יש לך חשבון?</h2>
        <p className="text-sm text-ink-600">
          הזן/י את הקוד <code dir="ltr" className="rounded bg-canvas px-1.5 py-0.5">{p.inviteCode}</code> בהגדרות → תוכנית שותפים, וההתקדמות שלך תיספר בקבוצה של {p.name}{p.cohort ? ` (${p.cohort})` : ""}. אנונימי: {p.name} רואה מספרים מצטברים בלבד.
        </p>
        <Link href="/Settings#partner" className="jm-btn jm-btn-secondary jm-btn-sm">להגדרות</Link>
      </section>
    </div>
  );
}
