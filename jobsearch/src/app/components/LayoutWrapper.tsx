"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";
import RevealObserver from "./RevealObserver";
import BackgroundAurora from "./BackgroundAurora";
import AccessibilityMenu from "./AccessibilityMenu";
import PwaRegister from "./PwaRegister";
import { LanguageProvider } from "../lib/i18n/LanguageProvider";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideFooterAndHeader = ["/Login", "/SignUp", "/PasswordReset"].includes(pathname);

  return (
    <LanguageProvider>
      <a href="#main-content" className="jm-skip-link">דלג לתוכן</a>
      <BackgroundAurora />
      <RevealObserver />
      {!hideFooterAndHeader && <Header />}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full mx-auto outline-none">{children}</main>
      {!hideFooterAndHeader && <Footer />}
      <AccessibilityMenu />
      <PwaRegister />
    </LanguageProvider>
  );
}
