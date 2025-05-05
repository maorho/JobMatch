"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useState } from "react";
import image from "./jobMatch.png";
import { AiOutlineUser } from "react-icons/ai";
import SideNavbar from "./SideNavbar";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useCurrentUser();
  // פונקציה להפעלת והסרת ה-Side Navbar
  const toggleSidenav = () => {
    setIsOpen(!isOpen);
  };

  // פונקציה לסגירת ה-Side Navbar
  const closeNav = () => {
    setIsOpen(false);
  };

  return (
    <header className="h-13 flex bg-gradient-to-r from-blue-100 to-blue-500 sticky top-0 z-10">
      <nav className="flex items-center justify-between px-6">
        <ul className="flex items-center text-black">
          {/* כפתור תמונה */}
          <li className="mr-2.5 mt-1.5">
            <Link href="/">
              <Image src={image} alt="Job Match" className="h-20 w-20" />
            </Link>
          </li>
        </ul>
      </nav>

      {/* כפתור ה-user בצד ימין */}
      <button
        onClick={toggleSidenav}
        className="fixed right-4 transform mt-3 bg-white rounded-full p-1 hover:bg-blue-200 transition-colors"
      >
        <AiOutlineUser className="text-2xl text-black" />
      </button>

      {/* Side Navbar */}
      {isOpen && <SideNavbar closeNav={closeNav} isOpen={isOpen} />}
    </header>
  );
}

export default Header;
