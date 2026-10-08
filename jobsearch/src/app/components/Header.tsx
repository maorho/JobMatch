"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, LayoutDashboard, Settings, ChevronDown } from "lucide-react";
import SideNavbar from "./SideNavbar";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import NotificationBell from "./NotificationBell";
import MessagesBadge from "./MessagesBadge";
import LogoutButton from "./Logout";
import { NAV_LINKS, dashboardHref, userInitial } from "./nav";

function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const iconBtn = "relative flex items-center justify-center h-11 w-11 rounded-control bg-white/10 text-white hover:bg-white/20 transition-colors";

  return (
    <header className="sticky top-0 z-40 bg-navy text-white shadow-[0_8px_24px_-16px_rgb(16_43_57/0.6)]">
      <div className="jm-container flex items-center gap-3 h-[72px]">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="JobMatch home">
          <Image src="/jobMatchIcon.png" alt="" width={44} height={44} priority className="rounded-xl" />
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ms-8">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive(l.href) ? "bg-white/15 text-white" : "text-white/75 hover:text-white hover:bg-white/10"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Link href="/ResumeAI" className="jm-btn jm-btn-primary jm-btn-sm hidden sm:inline-flex">
            <Sparkles className="h-4 w-4" />
            ResumeAI
          </Link>

          {user && (
            <>
              <MessagesBadge className={iconBtn} />
              <NotificationBell className={iconBtn} />
            </>
          )}

          {/* Account menu (desktop) */}
          <div className="relative hidden lg:block" ref={menuRef}>
            {user ? (
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 ps-1 pe-2 h-11 rounded-control bg-white/10 hover:bg-white/20 transition-colors"
              >
                <span className="h-9 w-9 rounded-xl bg-sky text-white font-semibold flex items-center justify-center text-sm">
                  {userInitial(user)}
                </span>
                <span className="max-w-[140px] truncate text-sm">{user.fullname || user.username}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/Login" className="jm-btn jm-btn-sm text-white hover:bg-white/10">Sign in</Link>
                <Link href="/SignUp" className="jm-btn jm-btn-accent jm-btn-sm">Sign up</Link>
              </div>
            )}

            {menuOpen && user && (
              <div role="menu" className="absolute end-0 mt-2 w-56 jm-card p-2 text-ink shadow-card-hover">
                <div className="px-3 py-2 border-b border-line mb-1">
                  <div className="text-sm font-semibold truncate">{user.fullname || user.username}</div>
                  <div className="jm-muted truncate" dir="ltr">{user.email}</div>
                </div>
                <Link href={dashboardHref(user)} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-canvas">
                  <LayoutDashboard className="h-4 w-4 text-ink-400" /> Dashboard
                </Link>
                <Link href="/Settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-canvas">
                  <Settings className="h-4 w-4 text-ink-400" /> Settings
                </Link>
                <div className="border-t border-line mt-1 pt-1">
                  <LogoutButton closeNav={() => setMenuOpen(false)} className="w-full text-start flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50" />
                </div>
              </div>
            )}
          </div>

          {/* Mobile: drawer trigger */}
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className={`${iconBtn} lg:hidden`}>
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      <SideNavbar isOpen={drawerOpen} closeNav={() => setDrawerOpen(false)} />
    </header>
  );
}

export default Header;
