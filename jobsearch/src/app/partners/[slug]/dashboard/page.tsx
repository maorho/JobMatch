import type { Metadata } from "next";
import { partnerForToken, partnerFunnel } from "@/app/lib/partners/partners";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "דשבורד שותפים", robots: { index: false, follow: false } };

type Params = Promise<{ slug: string }>;
type Search = Promise<{ token?: string }>;

/** The partner's cohort funnel. No login: the dashboard token from the admin (`?token=`). */
export default async function PartnerDashboard({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const { token } = await searchParams;
  const partner = await partnerForToken(slug, token || "");
  if (!partner) {
    return (
      <div className="jm-page" dir="rtl">
        <div className="jm-card p-8 text-center space-y-2">
          <div className="text-3xl">🔒</div>
          <p className="text-ink-600">הקישור לדשבורד לא תקין או שפג תוקפו. בקשו קישור חדש מצוות JobMatch.</p>
        </div>
      </div>
    );
  }
  const f = await partnerFunnel(partner.slug);
  const pct = (n: number) => (f.members ? `${Math.round((n / f.members) * 100)}%` : "–");
  const rows: [string, number, string][] = [
    ["נרשמו ל-JobMatch", f.members, ""],
    ["העלו קו״ח", f.withResume, pct(f.withResume)],
    ["הגישו מועמדות", f.applied, pct(f.applied)],
    ["הוזמנו לראיון (לפחות שיחת HR)", f.interviews, pct(f.interviews)],
    ["קיבלו הצעה", f.offers, pct(f.offers)],
  ];
  return (
    <div className="jm-page" dir="rtl">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">תוכנית שותפים · {partner.name}{partner.cohort ? ` · ${partner.cohort}` : ""}</div>
        <h1 className="jm-title">איך הקבוצה שלכם מתקדמת</h1>
        <p className="jm-subtitle">מספרים מצטברים בלבד, בלי פרטים אישיים. קוד ההזמנה: <code dir="ltr">{partner.inviteCode}</code></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {[["הגשות סה״כ", f.applications], ["ראיונות מדומים", f.mockInterviews], ["פעילים בשבוע האחרון", f.activeLast7d]].map(([l, v]) => (
          <div key={String(l)} className="jm-card p-5">
            <div className="text-3xl font-semibold text-navy leading-none">{v}</div>
            <div className="jm-muted mt-2">{l}</div>
          </div>
        ))}
      </div>
      <div className="jm-card p-5 sm:p-6">
        <h2 className="jm-h2 mb-3">המשפך</h2>
        <table className="jm-table">
          <thead><tr><th>שלב</th><th>אנשים</th><th>מהנרשמים</th></tr></thead>
          <tbody>{rows.map(([l, n, p]) => <tr key={l}><td className="font-medium text-navy">{l}</td><td>{n}</td><td className="text-ink-600">{p}</td></tr>)}</tbody>
        </table>
        {f.responseRate !== null && <p className="jm-muted mt-3">שיעור תגובה להגשות (מתוך הגשות שהוכרעו): {f.responseRate}%</p>}
      </div>
    </div>
  );
}
