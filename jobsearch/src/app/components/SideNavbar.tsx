"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X, Sparkles, Bell, MessageCircle, LayoutDashboard, Settings } from "lucide-react";
import LogoutButton from "./Logout";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { NAV_LINKS, dashboardHref, userInitial } from "./nav";
import { loginHref } from "../lib/hooks/nextPath";

interface SideNavbarProps {
  closeNav: () => void;
  isOpen: boolean;
}

/** Mobile navigation drawer (slides in from the end edge). */
const SideNavbar: React.FC<SideNavbarProps> = ({ closeNav, isOpen }) => {
  const pathname = usePathname();
  const { user, sessionExpired } = useCurrentUser();
  const lastPathRef = useRef(pathname);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signInHref = loginHref(pathname);

  // Close when the route changes (link tapped inside the drawer).
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      closeNav();
    }
  }, [pathname, closeNav]);

  // Lock page scroll + close on Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeNav();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, closeNav]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const item = (active: boolean) =>
    `flex items-center gap-3 px-4 py-3 rounded-control text-base font-medium transition-colors ${
      active ? "bg-navy text-white" : "text-navy hover:bg-canvas"
    }`;

  // Portal to <body>: the sticky header uses backdrop-blur, which makes it the containing
  // block for `fixed` children, so rendered in place the drawer was only as tall as the header.
  if (!mounted) return null;

  return createPortal(
    <div className={`lg:hidden fixed inset-0 z-[70] overflow-hidden ${isOpen ? "" : "pointer-events-none"}`} aria-hidden={!isOpen} inert={!isOpen}>
      <div
        onClick={closeNav}
        className={`absolute inset-0 bg-navy/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
      />
      {/* The root is never dir="rtl" (see layout.tsx), so the panel always parks off the right edge (Tailwind 4's ltr:/rtl: variants both matched and the rtl one left a 56px strip on screen). The wrapper's overflow-hidden is essential: without it the parked panel's right edge widens the phone's layout viewport and the whole page lays out wider than the screen. */}
      <aside
        role="dialog"
        aria-label="Menu"
        className={`absolute top-0 end-0 h-full w-[86%] max-w-sm bg-surface text-ink shadow-card-hover flex flex-col
          transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 h-[72px] border-b border-line">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/jobMatchIcon.png" alt="" width={36} height={36} className="rounded-lg" />
            <span className="font-semibold text-navy">JobMatch</span>
          </Link>
          <button onClick={closeNav} aria-label="Close menu" className="jm-btn jm-btn-ghost jm-btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto jm-scroll p-4 space-y-5">
          {user ? (
            <div className="flex items-center gap-3 p-3 rounded-card bg-canvas border border-line">
              <span className="h-11 w-11 rounded-xl bg-sky text-white font-semibold flex items-center justify-center">{userInitial(user)}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{user.fullname || user.username}</div>
                <div className="jm-muted truncate" dir="ltr">{user.email}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {sessionExpired && (
                <p className="jm-alert jm-alert-info" dir="rtl" role="status">
                  ההתחברות פגה, התחבר/י שוב
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Link href={signInHref} className="jm-btn jm-btn-secondary">Sign in</Link>
                <Link href="/SignUp" className="jm-btn jm-btn-accent">Sign up</Link>
              </div>
            </div>
          )}

          <nav className="space-y-1">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={item(isActive(l.href))}>
                {l.label}
              </Link>
            ))}
            <Link href="/ResumeAI" className={item(isActive("/ResumeAI"))}>
              <Sparkles className="h-5 w-5 text-teal" /> ResumeAI
            </Link>
          </nav>

          {user && (
            <nav className="space-y-1 pt-4 border-t border-line">
              <Link href={dashboardHref(user)} className={item(isActive(dashboardHref(user)))}>
                <LayoutDashboard className="h-5 w-5 text-ink-400" /> Dashboard
              </Link>
              <Link href="/messages" className={item(isActive("/messages"))}>
                <MessageCircle className="h-5 w-5 text-ink-400" /> Messages
              </Link>
              <Link href="/notifications" className={item(isActive("/notifications"))}>
                <Bell className="h-5 w-5 text-ink-400" /> Notifications
              </Link>
              <Link href="/Settings" className={item(isActive("/Settings"))}>
                <Settings className="h-5 w-5 text-ink-400" /> Settings
              </Link>
            </nav>
          )}
        </div>

        {user && (
          <div className="p-4 border-t border-line">
            <LogoutButton closeNav={closeNav} className="jm-btn jm-btn-secondary w-full text-red-600" />
          </div>
        )}
      </aside>
    </div>
  , document.body);
};

export default SideNavbar;
