"use client";
import Link from "next/link";
import CompanyLogo from "@/app/components/CompanyLogo";
import { useT } from "@/app/lib/i18n/LanguageProvider";

/** Plain JSON for the client: the server page converts dates to ISO strings. */
export type BankIndexCompany = { company: string; companyKey: string; questions: number; reported: number; web: number; reporters: number; lastAskedAt: string };

/** The question-bank index UI; the server page keeps the metadata, the data fetch and the JSON-LD. */
export default function BankIndexView({ companies, total }: { companies: BankIndexCompany[]; total: number }) {
  const { t, lang, dir } = useT();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  return (
    <div className="jm-page" dir={dir}>
      <div className="mb-6 sm:mb-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">{t("interview.bank.eyebrow")}</div>
        <h1 className="jm-title">{t("interview.bank.title")}</h1>
        <p className="jm-subtitle">
          {total > 0 ? t("interview.bank.countLead", { total: total.toLocaleString(), companies: companies.length }) : ""}
          {t("interview.bank.sub")}
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="jm-card p-8 text-center space-y-3">
          <div className="text-3xl">🗂️</div>
          <p className="text-ink-600">{t("interview.bank.empty")}</p>
          <Link href="/SignUp" className="jm-btn jm-btn-primary">{t("interview.bank.join")}</Link>
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
                    {t("interview.bank.nQuestions", { n: c.questions })} · {c.reporters > 0 ? t(c.reporters === 1 ? "interview.bank.reporterOne" : "interview.bank.reporters", { n: c.reporters }) : t("interview.bank.fromWeb")}{c.reporters > 0 && c.web > 0 ? t("interview.bank.plusWeb", { n: c.web }) : ""} · {t("interview.bank.updated", { date: new Date(c.lastAskedAt).toLocaleDateString(locale) })}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="jm-card p-5 sm:p-6 mt-8 space-y-2">
        <h2 className="jm-h2">{t("interview.bank.how")}</h2>
        <p className="text-sm text-ink-600 leading-relaxed">{t("interview.bank.howText", { company: companies[0]?.company || t("interview.bank.aCompany") })}</p>
      </section>
    </div>
  );
}
