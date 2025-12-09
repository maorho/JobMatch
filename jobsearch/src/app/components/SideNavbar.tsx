"use client";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./Logout";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { MessageIcon, NotificationIcon, ResumeAIIcon } from "./icons";
import { useRouter } from "next/navigation";

interface SideNavbarProps {
  closeNav: () => void;
  isOpen: boolean;
}

const SideNavbar: React.FC<SideNavbarProps> = ({ closeNav, isOpen}) => {
  const pathname = usePathname();
  const { user, loading } = useCurrentUser();
  const lastPathRef = useRef(pathname);
  const initialLoad = useRef(true);
  const router = useRouter();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const mobilePages = ["Companies", "Articels", "ContactUs"];
  const userConnectedPages = ["Dashboard", "Settings"];
  const guestPages = ["Login", "SignUp"];
  const iconsPages = [{page:"ResumeAI",navigate:()=>{router.push("/ResumeAI")},icon: ResumeAIIcon}, {page:"Notifications",navigate:()=>{router.push(`/notifications/${user.id}`)}, icon: NotificationIcon}, {page:"Messages",navigate:()=>{router.push(`/messages/${user.id}`)}, icon: MessageIcon}];

  useEffect(() => {
      const checkWidth = () => setIsMobile(window.innerWidth < 1024);
      checkWidth();
      window.addEventListener("resize", checkWidth);
      return () => window.removeEventListener("resize", checkWidth);
    }, []);

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
  }, [pathname,closeNav]);

  if (loading) return null;

  return (
    <div
      className={`fixed top-0 right-0 bg-white w-60 ${user?"h-110":"h-80"} lg:h-40 rounded-3xl lg:rounded-b-3xl p-5 lg:mt-18 mt-[95px] shadow-lg z-50
    transform transition-all duration-300 ease-in-out
    ${isOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}
  `}
    >
      <ul className="space-y-6 items-center justify-center flex flex-col">
        {user ? ((!isMobile)?
        //user connected and desktop
          <>
            {userConnectedPages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}Page`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
            <li>
              <LogoutButton closeNav={closeNav} />
            </li>
          </> :
          //user connected and mobile
          <>
          <>
            {userConnectedPages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
            <li>
              <LogoutButton closeNav={closeNav} />
            </li>
            </>
            <div className="w-full border h-[1px] border-b-cyan-950"></div>
            <>
            {mobilePages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}Page`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
            </>
            <>
            <div className="w-full border h-[1px] border-b-cyan-950"></div>
            <div className="flex">
              {iconsPages.map(({page,navigate,icon:Icon})=>(
                <button key={page} onClick={navigate} className="mx-2">
                  <Icon />
                </button>
              ))}
            </div>
            </>
          </> 
          
        ) : (
          //guest desktop 
          (!isMobile)?
          <>
            {guestPages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}Page`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
          </>
          :(
          //guest mobile
          <>
            {guestPages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}Page`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
            <div className="w-full border h-[1px] border-b-cyan-950"></div>
            <>
            {mobilePages.map((page) => (
              <li key={page}>
                <Link
                  href={`/${page.replace(" ", "")}`}
                  className={`text-lg font-semibold hover:text-blue-400 ${
                    pathname === `/${page.replace(" ", "")}Page`
                      ? "text-blue-400"
                      : ""
                  }`}
                >
                  {page}
                </Link>
              </li>
            ))}
            </>
          </>
          )
        )}
        <li></li>
      </ul>
    </div>
  );
};

export default SideNavbar;
