"use client";
import Link from "next/link";
import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./Logout";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

interface SideNavbarProps {
  closeNav: () => void;
  isOpen: boolean;
}

const SideNavbar: React.FC<SideNavbarProps> = ({ closeNav, isOpen }) => {
  const pathname = usePathname();
  const { user, loading } = useCurrentUser(); // ✅ כולל loading
  const lastPathRef = useRef(pathname);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      lastPathRef.current = pathname;
      return;
    }

    if (pathname !== lastPathRef.current) {
      closeNav();
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  if (loading) return null;

  return (
    <div
      className={`fixed top-0 right-0 h-full w-32 p-5 mt-13 transform transition-all duration-300 ease-in-out
        ${isOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}
      `}
    >
      <ul className="space-y-6">
        {user ? (
          <>
            <li>
              <Link
                href="/UserSettings"
                className="text-lg font-semibold hover:text-blue-400"
              >
                Settings
              </Link>
            </li>
            <li>
              <LogoutButton closeNav={closeNav} />
            </li>
          </>
        ) : (
          <>
            <li>
              <Link
                href="/LoginPage"
                className="text-lg font-semibold hover:text-blue-400"
              >
                Login
              </Link>
            </li>
            <li>
              <Link
                href="/SignUp"
                className="text-lg font-semibold hover:text-blue-400"
              >
                SignUp
              </Link>
            </li>
          </>
        )}
        <li>
          <button
            onClick={closeNav}
            className="text-lg font-semibold text-red-500 hover:text-red-400"
          >
            Close
          </button>
        </li>
      </ul>
    </div>
  );
};

export default SideNavbar;
