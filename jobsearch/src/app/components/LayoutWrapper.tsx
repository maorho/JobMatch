"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";
import RevealObserver from "./RevealObserver";
import BackgroundAurora from "./BackgroundAurora";
import AccessibilityMenu from "./AccessibilityMenu";
import PwaRegister from "./PwaRegister";
import { LanguageProvider, useT } from "../lib/i18n/LanguageProvider";

/** Inside the provider, so the skip link follows the interface language. */
function SkipLink() {
  const { t } = useT();
  return <a href="#main-content" className="jm-skip-link">{t("pages.layout.skip")}</a>;
}

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideFooterAndHeader = ["/Login", "/SignUp", "/PasswordReset"].includes(pathname);

  return (
    <LanguageProvider>
      <SkipLink />
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
