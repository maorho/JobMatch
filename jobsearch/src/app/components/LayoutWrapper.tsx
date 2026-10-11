"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";
import RevealObserver from "./RevealObserver";
import BackgroundAurora from "./BackgroundAurora";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideFooterAndHeader = ["/Login", "/SignUp", "/PasswordReset"].includes(pathname);

  return (
    <>
      <BackgroundAurora />
      <RevealObserver />
      {!hideFooterAndHeader && <Header />}
      <main className="flex-1 w-full mx-auto">{children}</main>
      {!hideFooterAndHeader && <Footer />}
    </>
  );
}
