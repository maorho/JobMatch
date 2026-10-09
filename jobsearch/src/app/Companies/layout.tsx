import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "חברות שמגייסות עכשיו בישראל",
  description: "כל החברות עם משרות פתוחות בקטלוג של JobMatch — כמה משרות, כמה ג'וניור, remote — ישירות מדפי הקריירה שלהן.",
  alternates: { canonical: "/Companies" },
};

export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
