"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useState } from "react";
import image from "./jobMatch.png";
import { AiOutlineUser } from "react-icons/ai";
import SideNavbar from "./SideNavbar";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { AiOutlineOpenAI } from "react-icons/ai";

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
    <header className="h-15 flex items-center justify-between px-6 sticky top-0 z-50 bg-white/80 shadow-md backdrop-blur-md">
      {/* לוגו בצד שמאל */}
      <Link href="/">
        <Image src={image} alt="Job Match" className="h-20 w-auto" />
      </Link>

      {/* קישורים במרכז */}
      <ul className="flex gap-15 text-black items-center justify-center mx-auto ">
        <li>
          <Link
            href="/CompaniesPage"
            className="hover:text-blue-500 font-medium"
          >
            Companies
          </Link>
        </li>
        <li>
          <Link href="/Articels" className="hover:text-blue-500 font-medium">
            Articles
          </Link>
        </li>
        <li>
          <Link href="/ContactUs" className="hover:text-blue-500 font-medium">
            Contact Us
          </Link>
        </li>
      </ul>

      {/* כפתורי ימין */}
      <div className="flex gap-4 items-center">
        <Link
          href="/ResumeAI"
          className="bg-white rounded-full p-1 hover:bg-blue-200 transition-colors"
        >
          <AiOutlineOpenAI className="h-6 w-6 text-black" />
        </Link>
        <button
          onClick={toggleSidenav}
          className="bg-white rounded-full p-1 hover:bg-blue-200 transition-colors"
        >
          <AiOutlineUser className="text-2xl text-black" />
        </button>
      </div>

      {/* Side Navbar */}
      {isOpen && <SideNavbar closeNav={closeNav} isOpen={isOpen} />}
    </header>
  );
}

export default Header;
