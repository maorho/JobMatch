"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { Spinner, SignInGate } from "../components/ui";
import ContactsCard from "../components/ContactsCard";
import AutoApplyCard from "../components/AutoApplyCard";
import SearchProfileCard from "../components/SearchProfileCard";
import { Check, FileText, Users, Zap, Target } from "lucide-react";

const STEPS = [
  { key: "target", title: "מה אני מחפש", icon: Target },
  { key: "resume", title: "קורות חיים", icon: FileText },
  { key: "contacts", title: "אנשי קשר", icon: Users },
  { key: "auto", title: "הגשה אוטומטית", icon: Zap },
] as const;

/** First-run flow: résumé → LinkedIn connections (recommended, optional) → auto-apply opt-in. */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [state, setState] = useState<{ hasResume: boolean; contactsStep: string; autoApply: boolean; fullname: string; hasSearchProfile: boolean } | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetch("/api/onboarding").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setState({ hasResume: d.hasResume, contactsStep: d.onboarding?.contactsStep || "", autoApply: d.autoApply, fullname: d.fullname, hasSearchProfile: !!d.hasSearchProfile });
      setStep(!d.hasSearchProfile ? 0 : d.hasResume ? (d.onboarding?.contactsStep ? 3 : 2) : 1);
    });
  }, [user]);

  const post = (body: object) => fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const finish = async () => {
    await post({ complete: true });
    router.push("/");
  };

  if (loading) return <Spinner label="טוען…" />;
  if (!user) return <SignInGate text="צריך להתחבר כדי להמשיך" next="/onboarding" />;
  if (!state) return <Spinner />;

  return (
    <div className="jm-page max-w-3xl" dir="rtl">
      <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">ברוך/ה הבא/ה</div>
      <h1 className="jm-title">היי {state.fullname.split(" ")[0] || ""}, בוא/י נכוון את הסוכנים שלך</h1>
      <p className="jm-subtitle">שלוש דקות, ואחר כך המערכת עובדת בשבילך: מתאימה, מציעה הפניות ומגישה.</p>

      <ol className="mt-6 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          return (
            <li key={s.key} className={`flex items-center gap-2 rounded-control px-3 py-2 text-sm border ${i === step ? "border-navy bg-navy text-white" : done ? "border-teal/30 bg-teal-50 text-teal-600" : "border-line text-ink-400"}`}>
              <span className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
              <span className="truncate">{s.title}</span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">1. מה את/ה מחפש/ת</h2>
          <p className="text-sm text-ink-600 leading-relaxed">ארבע תשובות קצרות, והפיד מציג רק משרות שבאמת רלוונטיות: תפקיד, רמה, מקום, מילות מפתח. אפשר לשנות בכל רגע בהגדרות.</p>
          <SearchProfileCard compact onSaved={() => { setState((s) => s && { ...s, hasSearchProfile: true }); setStep(1); }} />
          <div className="pt-2 border-t border-line">
            <button type="button" onClick={() => setStep(1)} className="jm-btn jm-btn-ghost">דלג בינתיים</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">2. קורות חיים</h2>
          <p className="text-sm text-ink-600 leading-relaxed">הכול מתחיל מקו״ח: ההתאמה, ההפניות וההגשות. העלה/י PDF קיים או בנה/י חדש בשיחה עם ResumeAI — זה גם הופך את הפיד למותאם אישית.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ResumeAI?welcome=1&next=/onboarding" className="jm-btn jm-btn-primary">לעבור ל-ResumeAI</Link>
            {state.hasResume && <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-secondary">יש לי כבר, הלאה</button>}
            {!state.hasResume && <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-ghost">אחר כך</button>}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">3. אנשי הקשר שלך מלינקדאין <span className="jm-chip jm-chip-teal ms-2">מומלץ</span></h2>
          <ContactsCard onImported={() => setState((s) => s && { ...s, contactsStep: "done" })} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
            <button type="button" onClick={() => setStep(3)} disabled={state.contactsStep !== "done"} className="jm-btn jm-btn-primary">המשך</button>
            <button type="button" onClick={async () => { await post({ contactsStep: "skipped" }); setState((s) => s && { ...s, contactsStep: "skipped" }); setStep(3); }} className="jm-btn jm-btn-ghost">דלג בינתיים</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">4. הגשה אוטומטית</h2>
          <AutoApplyCard onChange={(s) => setState((st) => st && { ...st, autoApply: s.enabled })} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
            <button type="button" onClick={finish} className="jm-btn jm-btn-primary">סיימנו — לפיד המשרות</button>
            <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-ghost">חזרה</button>
          </div>
        </section>
      )}
    </div>
  );
}
