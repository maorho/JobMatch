"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useState } from "react";
import SideNavbar from "./SideNavbar";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import { FiAlignRight } from "react-icons/fi";
import { MessageIcon, NotificationIcon, ResumeAIIcon, UserIcon } from "./icons";



function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pages = ["Companies", "Articels", "ContactUs"];
  const router = useRouter();
  const { user } = useCurrentUser();


  const handleNotification = () => {
    router.push(`/notifications/${user.id}`);
  };

  const handleMessaging = () => {
    router.push(`/messages/${user.id}`);
  };
  const toggleSidenav = () => {
    setIsOpen(!isOpen);
  };

  const closeNav = () => {
    setIsOpen(false);
  };
 
  return (
    <header className="sticky top-0 bg-[#102B39] w-full max-h-[90px] mx-auto justify-center rounded-b-[40px] flex z-[9999]">
      <div className="relative max-w-[1600px] w-full mx-auto flex">
        <Link className="ml-5 lg:ml-[68px] my-[11px]" href="/">
          <Image
            src="/jobMatchIcon.png"
            alt="Profile"
            width={68}
            height={68}
            priority
          />
        </Link>
        <div className="absolute right-0 block lg:hidden text-white z-50 pointer-events-auto">
          <FiAlignRight
            onClick={toggleSidenav}
            className="h-[50px] w-[50px] my-5 mr-5 cursor-pointer"
          />
        </div>

        <div className="hidden lg:block w-full">
          <ul className="flex gap-[50px] text-white items-center justify-center mx-auto pt-5">
            {pages.map((page) => {
                return (
                <li key={page}>
                  <Link
                    href={`/${page.replace(" ", "")}`}
                    className="hover:text-blue-500 font-medium"
                  >
                    {page}
                  </Link>
                </li>
                );
            })}
          </ul>
        </div>
        <div className="hidden lg:block items-center mr-[50px] my-[11px]">
          <div className="flex gap-[12.5px]">
            <Link
              href="/ResumeAI"
              className="flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors"
            >
              <ResumeAIIcon />
            </Link>
            {user && (
              <button
                onClick={handleMessaging}
                className="flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors"
              >
                <MessageIcon />
              </button>
            )}
            {user && (
              <button
                onClick={handleNotification}
                className="flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors"
              >
                <NotificationIcon />
              </button>
            )}
            <button
              onClick={toggleSidenav}
              className="flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors"
            >
              <UserIcon />
            </button>
          </div>
        </div>
      </div>
      <SideNavbar isOpen={isOpen} closeNav={closeNav} />‎
    </header>
  );
}

export default Header;
