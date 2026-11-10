"use client";
import React from "react";
import Link from "next/link";
import CompanyLogo from "@/app/components/CompanyLogo";
import SuggestedAnswer from "@/app/components/SuggestedAnswer";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import type { Key } from "@/app/lib/i18n/dict";

/** Plain JSON for the client (no Dates): the server page strips `lastAskedAt`. */
export type BankQuestionJson = { question: string; topic: string; stage: string; count: number; web: number; sources: { url: string; name: string }[]; roleTitles: string[] };
export type BankGroup = { stage: string; shown: BankQuestionJson[]; hidden: number };

const STAGE_KEY: Record<string, Key> = { hr: "interview.stage.hr", technical: "interview.stage.technical", final: "interview.stage.final", other: "interview.stage.other" };

function Provenance({ q }: { q: BankQuestionJson }) {
  const { t, dir } = useT();
  const src = q.sources.find((s) => s.url) || q.sources[0];
  // Each segment is bidi-isolated (English role titles, Hebrew provenance, a URL host) and the
  // separators live between them, so the line reads in one direction instead of interleaving.
  const parts: React.ReactNode[] = [];
  if (q.topic) parts.push(<span key="topic" dir="auto">{q.topic}</span>);
  if (q.count > 0) parts.push(<span key="count" className="inline-flex items-center gap-1 text-teal" dir={dir}>● {q.count > 1 ? t("interview.company.reportedBy", { n: q.count }) : t("interview.company.reportedByOne")}</span>);
  if (q.web > 0)
    parts.push(
      <span key="web" className="inline-flex items-center gap-1" dir={dir}>
        <span className="text-sky">◆</span> {t("interview.company.web")}
        {src?.name && (src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline" dir="ltr">({src.name})</a> : <bdi>({src.name})</bdi>)}
        {q.web > 1 && <bdi>+{q.web - 1}</bdi>}
      </span>
    );
  if (q.roleTitles.length > 0) parts.push(<span key="roles" dir="auto">{q.roleTitles.slice(0, 2).join(", ")}</span>);
  return (
    <div className="jm-muted flex flex-wrap items-center gap-x-1.5" dir={dir}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {p}
        </React.Fragment>
      ))}
    </div>
  );
}

/** "Collecting…" state for a catalog company whose first web harvest is running. */
export function HarvestingView({ company, slug }: { company: string; slug: string }) {
  const { t, dir } = useT();
  return (
    <div className="jm-page" dir={dir}>
      <Link href="/interview-questions" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">{t("interview.company.all")}</Link>
      <header className="mt-4 mb-6 flex items-start gap-4">
        <CompanyLogo name={company} className="w-14 h-14 flex-shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h1 className="jm-title">{t("interview.company.title", { company })}</h1>
          <p className="jm-subtitle">{t("interview.company.harvestingSub")}</p>
        </div>
      </header>
      <section className="jm-card p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600 leading-relaxed">{t("interview.company.harvestingText")}</p>
        <Link href={`/interview-questions/${slug}`} className="jm-btn jm-btn-primary jm-btn-sm">{t("interview.company.refresh")}</Link>
      </section>
    </div>
  );
}

type Props = {
  slug: string;
  company: string;
  total: number;
  reported: number;
  reporters: number;
  webCount: number;
  groups: BankGroup[];
  hidden: number;
  topics: string[];
  signedIn: boolean;
};

/** The company question bank UI; the server page keeps metadata, data loading and JSON-LD. */
export default function CompanyBankView({ slug, company, total, reported, reporters, webCount, groups, hidden, topics, signedIn }: Props) {
  const { t, dir } = useT();
  const stageTitle = (stage: string) => (STAGE_KEY[stage] ? t(STAGE_KEY[stage]) : stage);
  const sourceParts = [
    reported > 0 && t(reporters === 1 ? "interview.company.srcReportedOne" : "interview.company.srcReported", { n: reported, r: reporters }),
    webCount > 0 && t("interview.company.srcWeb", { n: webCount }),
  ].filter(Boolean) as string[];

  return (
    <div className="jm-page" dir={dir}>
      <Link href="/interview-questions" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">{t("interview.company.all")}</Link>
      <header className="mt-4 mb-6 flex items-start gap-4">
        <CompanyLogo name={company} className="w-14 h-14 flex-shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h1 className="jm-title">{t("interview.company.title", { company })}</h1>
          <p className="jm-subtitle">{t("interview.company.sub", { total, sources: sourceParts.join("; ") })}</p>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {topics.map((x) => <span key={x} className="jm-chip jm-chip-sky">{x}</span>)}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.stage} className="jm-card p-5 sm:p-6">
              <h2 className="jm-h2 mb-3"><bdi>{stageTitle(g.stage)}</bdi> <span className="jm-muted font-normal" dir={dir}>· {t("interview.bank.nQuestions", { n: g.shown.length + g.hidden })}</span></h2>
              <ol className="space-y-3 list-decimal ps-5">
                {g.shown.map((q, i) => (
                  <li key={i} className="text-ink">
                    <div className="font-medium text-navy" dir="auto">{q.question}</div>
                    <Provenance q={q} />
                    {signedIn && <SuggestedAnswer company={company} question={q.question} stage={q.stage} topic={q.topic} />}
                  </li>
                ))}
              </ol>
              {g.hidden > 0 && (
                <div className="mt-4 rounded-control border border-dashed border-line p-4 text-center space-y-2 bg-canvas">
                  <p className="text-sm text-ink-600">{t("interview.company.moreHidden", { n: g.hidden, stage: stageTitle(g.stage), company })}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href={`/Login?next=${encodeURIComponent(`/interview-questions/${slug}`)}`} className="jm-btn jm-btn-primary jm-btn-sm">{t("common.signIn")}</Link>
                    <Link href="/SignUp" className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.company.signUpFree")}</Link>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="jm-card p-5 space-y-3">
            <h3 className="jm-h2 text-base">{t("interview.company.practiceTitle")}</h3>
            <p className="text-sm text-ink-600 leading-relaxed">{t("interview.company.practiceText", { company })}</p>
            <Link href={`/?company=${encodeURIComponent(company)}`} className="jm-btn jm-btn-primary w-full">{t("interview.company.openJobs", { company })}</Link>
            {!signedIn && <p className="jm-muted text-center">{hidden > 0 ? t("interview.company.unlockN", { n: hidden }) : t("interview.company.unlock")}</p>}
          </section>
          <section className="jm-card p-5 space-y-2">
            <h3 className="jm-h2 text-base">{t("interview.company.whereFrom")}</h3>
            <p className="text-sm text-ink-600 leading-relaxed"><span className="text-teal">●</span> {t("interview.company.where1")}</p>
            <p className="text-sm text-ink-600 leading-relaxed"><span className="text-sky">◆</span> {t("interview.company.where2")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
