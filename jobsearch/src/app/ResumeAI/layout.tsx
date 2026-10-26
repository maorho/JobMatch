import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ResumeAI — בניית קורות חיים שעוברים ATS",
  description: "העלה/י קו״ח או בנה/י חדש בשיחה עם ResumeAI: ציון, שיפורים, PDF נקי, והתאמה אוטומטית למשרות.",
  robots: { index: false, follow: true },
};

export default function ResumeAILayout({ children }: { children: React.ReactNode }) {
  return children;
}
