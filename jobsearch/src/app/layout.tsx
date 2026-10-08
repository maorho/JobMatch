import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "./components/LayoutWrapper";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "JobMatch", template: "%s · JobMatch" },
  description: "AI job search: fresh openings, resume matching and interview prep.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102b39",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        <link rel="icon" href="/favicon.png" sizes="32x32" />
      </head>
      <body className="w-full min-h-screen flex flex-col font-outfit">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
