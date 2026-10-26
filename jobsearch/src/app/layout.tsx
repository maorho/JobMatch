import type { Metadata, Viewport } from "next";
import { Assistant, Lora } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "./components/LayoutWrapper";
import { siteUrl } from "./lib/seo/site";

// UI face: Assistant (Latin + Hebrew, so Hebrew no longer falls back to the OS font) for all text
// and headings; Lora (serif) is kept for the hero headline only. Both open-licensed via Google Fonts.
const inter = Assistant({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter-next",
  display: "swap",
});
const serif = Lora({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif-next",
  display: "swap",
});

export const metadata: Metadata = {
  // siteUrl() is "" in production without APP_URL (env.ts refuses to boot then, but `next build`
  // must not crash on it): new URL("") throws and fails the whole build.
  ...(siteUrl() ? { metadataBase: new URL(siteUrl()) } : {}),
  title: { default: "JobMatch — משרות הייטק בישראל עם התאמה אישית", template: "%s · JobMatch" },
  description: "4,000+ משרות הייטק חיות מ-120+ חברות בישראל, מותאמות לקורות החיים שלך: התאמה חכמה, הכנה לראיון, הפניות והגשה אוטומטית. חינם.",
  applicationName: "JobMatch",
  keywords: ["משרות הייטק", "משרות ג'וניור", "חיפוש עבודה", "קורות חיים", "הכנה לראיון", "tech jobs Israel", "junior developer jobs"],
  openGraph: { type: "website", siteName: "JobMatch", locale: "he_IL", url: siteUrl(), images: [{ url: "/og.png", width: 1200, height: 630, alt: "JobMatch" }] },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  // No root canonical: it would be inherited by every page that doesn't set
  // its own. Indexable pages (jobs, articles, companies, interview questions,
  // partners) declare their canonical themselves.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2f4ad6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The UI is Hebrew. Direction stays the default (ltr) on purpose: pages and
    // containers set dir="rtl"/"ltr" themselves (≈40 of each), and flipping it
    // here would mirror every ml-/mr-/text-left layout that assumes ltr.
    <html lang="he" className={`${inter.variable} ${serif.variable}`}>
      <body className="w-full min-h-screen flex flex-col font-sans">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
