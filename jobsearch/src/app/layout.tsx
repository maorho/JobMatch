import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import LayoutWrapper from "./components/LayoutWrapper";
import { siteUrl } from "./lib/seo/site";

// UI face: Assistant (Latin + Hebrew, so Hebrew no longer falls back to the OS font) for all text
// and headings; Lora (serif) is kept for the hero headline only. Both are OFL fonts from Google
// Fonts, self-hosted in ./fonts: `next/font/google` downloads them at build time, and a flaky
// download failed a Vercel build ("next/font/google queries have exactly one entry").
// Variable fonts: one file per subset covers every weight.
const inter = localFont({
  src: [
    { path: "./fonts/assistant-latin.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/assistant-hebrew.woff2", weight: "200 800", style: "normal" },
  ],
  variable: "--font-inter-next",
  display: "swap",
});
const serif = localFont({
  src: [
    { path: "./fonts/lora-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/lora-latin-italic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-serif-next",
  display: "swap",
});

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "JobMatch" },
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
    <html lang="he" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* The interface language before first paint: the stored choice (localStorage, then the jm_lang cookie), else Hebrew. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem("jm:lang")||(document.cookie.match(/(?:^|; )jm_lang=(he|en)/)||[])[1];if(l==="he"||l==="en"){document.documentElement.setAttribute("lang",l);document.documentElement.setAttribute("data-lang",l);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="w-full min-h-screen flex flex-col font-sans">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
