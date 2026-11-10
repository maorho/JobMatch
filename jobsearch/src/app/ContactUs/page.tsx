"use client";
import { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";

export default function ContactUsPage() {
  const { t, dir } = useT();
  const { user } = useCurrentUser();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.fullname || "", email: f.email || user.email || "" }));
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.issues?.length ? t("pages.contact.invalidFields", { fields: data.issues.join(", ") }) : data?.error || t("pages.contact.sendFailed"));
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader
        title={t("pages.contact.title")}
        subtitle={t("pages.contact.subtitle")}
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="jm-card p-5 sm:p-6">
          {state === "sent" ? (
            <div className="jm-alert jm-alert-ok text-center py-10">
              <div className="text-4xl">✅</div>
              <h2 className="jm-h2 mt-3">{t("pages.contact.sentTitle")}</h2>
              <p className="text-ink-600 mt-1">{t("pages.contact.sentText", { email: form.email })}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="jm-label" htmlFor="contact-name">{t("pages.contact.name")}</label>
                  <input id="contact-name" className="jm-input" placeholder={t("pages.contact.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
                </div>
                <div>
                  <label className="jm-label" htmlFor="contact-email">{t("pages.contact.email")}</label>
                  <input id="contact-email" className="jm-input" type="email" placeholder={t("pages.contact.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
                </div>
              </div>
              <div>
                <label className="jm-label" htmlFor="contact-subject">{t("pages.contact.subject")}</label>
                <input id="contact-subject" className="jm-input" placeholder={t("pages.contact.subject")} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="jm-label" htmlFor="contact-message">{t("pages.contact.message")}</label>
                <textarea id="contact-message" className="jm-input" rows={6} placeholder={t("pages.contact.message")} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength={10} />
              </div>
              {/* Honeypot — hidden from humans, filled by bots. */}
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" aria-hidden="true" />
              {error && <div className="jm-alert jm-alert-err">⚠️ {error}</div>}
              <button type="submit" disabled={state === "sending"} className="jm-btn jm-btn-primary w-full">
                {state === "sending" ? t("pages.contact.sending") : t("pages.contact.send")}
              </button>
            </form>
          )}
        </div>

        <aside className="jm-card p-5 sm:p-6 space-y-5">
          <h2 className="jm-h2">{t("pages.contact.howTitle")}</h2>
          <ul className="space-y-4 text-sm text-ink-600 leading-relaxed">
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🧑‍💼</span>
              <span><span className="font-medium text-navy">{t("pages.contact.recruiters")}</span> {t("pages.contact.recruitersText")}</span>
            </li>
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🏢</span>
              <span><span className="font-medium text-navy">{t("pages.contact.companies")}</span> {t("pages.contact.companiesText")}</span>
            </li>
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🐞</span>
              <span><span className="font-medium text-navy">{t("pages.contact.bugs")}</span> {t("pages.contact.bugsText")}</span>
            </li>
          </ul>
          <div className="border-t border-line pt-4 text-sm text-ink-600">
            <span className="jm-chip jm-chip-teal">{t("pages.contact.responseTime")}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
