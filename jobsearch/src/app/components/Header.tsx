"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useState } from "react";
import SideNavbar from "./SideNavbar";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import { FiAlignRight } from "react-icons/fi";

const UserIcon = () => (
  <svg
    width="18"
    height="20"
    viewBox="0 0 18 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9 11C11.396 11 13.575 11.694 15.178 12.671C15.978 13.161 16.662 13.736 17.156 14.361C17.642 14.977 18 15.713 18 16.5C18 17.345 17.589 18.011 16.997 18.486C16.437 18.936 15.698 19.234 14.913 19.442C13.335 19.859 11.229 20 9 20C6.771 20 4.665 19.86 3.087 19.442C2.302 19.234 1.563 18.936 1.003 18.486C0.41 18.01 0 17.345 0 16.5C0 15.713 0.358 14.977 0.844 14.361C1.338 13.736 2.021 13.161 2.822 12.671C4.425 11.694 6.605 11 9 11Z"
      fill="black"
    />
    <path
      d="M9 0C12.849 0 15.255 4.167 13.33 7.5C12.8912 8.26008 12.26 8.89125 11.4999 9.3301C10.7399 9.76894 9.87766 9.99998 9 10C5.151 10 2.745 5.833 4.67 2.5C5.10883 1.73992 5.74 1.10875 6.50007 0.669905C7.26014 0.231064 8.12234 2.22961e-05 9 0Z"
      fill="black"
    />
  </svg>
);
const NotificationIcon = () => (
  <svg
    width="21"
    height="20"
    viewBox="0 0 21 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.1829 3.65854C13.1829 2.68823 13.5684 1.75767 14.2545 1.07156C14.9406 0.385452 15.8712 0 16.8415 0C17.8118 0 18.7423 0.385452 19.4284 1.07156C20.1145 1.75767 20.5 2.68823 20.5 3.65854C20.5 4.62884 20.1145 5.5594 19.4284 6.24551C18.7423 6.93162 17.8118 7.31707 16.8415 7.31707C15.8712 7.31707 14.9406 6.93162 14.2545 6.24551C13.5684 5.5594 13.1829 4.62884 13.1829 3.65854Z"
      fill="#24A8A2"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.4776 0.97561C11.8735 1.95686 11.6179 3.11313 11.7522 4.25756C11.8865 5.40199 12.4027 6.46771 13.2175 7.28249C14.0323 8.09728 15.098 8.61352 16.2424 8.74779C17.3869 8.88206 18.5431 8.62651 19.5244 8.02244V13.4146C19.5244 15.1612 18.8306 16.8362 17.5956 18.0712C16.3606 19.3062 14.6856 20 12.939 20H7.08537C5.33882 20 3.6638 19.3062 2.42881 18.0712C1.19381 16.8362 0.5 15.1612 0.5 13.4146V7.56098C0.5 5.81443 1.19381 4.13941 2.42881 2.90442C3.6638 1.66942 5.33882 0.97561 7.08537 0.97561H12.4776Z"
      fill="black"
    />
  </svg>
);
const MessageIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10.0034 5.66838e-07C8.26845 -0.000583501 6.56323 0.450208 5.05525 1.30808C3.54728 2.16595 2.28843 3.40139 1.40241 4.893C0.516388 6.38461 0.0336744 8.08107 0.00169895 9.81569C-0.0302765 11.5503 0.389587 13.2634 1.22003 14.7867L0.0367002 18.9367C-0.0049377 19.0824 -0.00604698 19.2367 0.0334919 19.383C0.0730307 19.5293 0.151721 19.6621 0.261092 19.767C0.370464 19.8719 0.506376 19.945 0.654201 19.9784C0.802026 20.0119 0.956167 20.0043 1.10003 19.9567L4.9967 18.6583C6.3248 19.4258 7.81165 19.8774 9.34222 19.9783C10.8728 20.0792 12.4061 19.8267 13.8234 19.2402C15.2408 18.6537 16.5042 17.7491 17.516 16.5962C18.5278 15.4433 19.2608 14.0731 19.6584 12.5917C20.0559 11.1102 20.1073 9.55709 19.8086 8.05256C19.5098 6.54803 18.869 5.13238 17.9357 3.91514C17.0023 2.69789 15.8014 1.71167 14.426 1.03278C13.0505 0.353885 11.5373 0.000513249 10.0034 5.66838e-07ZM6.67003 8.33333C6.67003 8.11232 6.75783 7.90036 6.91411 7.74408C7.07039 7.5878 7.28235 7.5 7.50337 7.5H12.5034C12.7244 7.5 12.9363 7.5878 13.0926 7.74408C13.2489 7.90036 13.3367 8.11232 13.3367 8.33333C13.3367 8.55435 13.2489 8.76631 13.0926 8.92259C12.9363 9.07887 12.7244 9.16667 12.5034 9.16667H7.50337C7.28235 9.16667 7.07039 9.07887 6.91411 8.92259C6.75783 8.76631 6.67003 8.55435 6.67003 8.33333ZM7.50337 10.8333H10.8367C11.0577 10.8333 11.2697 10.9211 11.426 11.0774C11.5822 11.2337 11.67 11.4457 11.67 11.6667C11.67 11.8877 11.5822 12.0996 11.426 12.2559C11.2697 12.4122 11.0577 12.5 10.8367 12.5H7.50337C7.28235 12.5 7.07039 12.4122 6.91411 12.2559C6.75783 12.0996 6.67003 11.8877 6.67003 11.6667C6.67003 11.4457 6.75783 11.2337 6.91411 11.0774C7.07039 10.9211 7.28235 10.8333 7.50337 10.8333Z"
      fill="black"
    />
  </svg>
);
const ResumeAIIcon = () => (
  <svg
    width="23"
    height="22"
    viewBox="0 0 23 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.2167 14.1667L5.83893 11V5.44445C5.83893 2.98889 7.8656 1.00001 10.3678 1.00001C11.92 1.00001 13.29 1.76667 14.1067 2.93445M8.83337 18.9778C9.25101 19.6019 9.81648 20.1132 10.4795 20.466C11.1424 20.8188 11.8824 21.0023 12.6334 21C15.1334 21 17.1623 19.0111 17.1623 16.5555V11L11.6778 7.77445M8.66893 12.6667V6.18889L13.5711 3.41112C15.7378 2.18334 18.5078 2.91112 19.7589 5.03667C20.1421 5.68466 20.3512 6.4207 20.366 7.17334C20.3808 7.92599 20.2007 8.66967 19.8434 9.33222M3.1556 12.6667C2.79805 13.3291 2.61783 14.0728 2.63243 14.8254C2.64703 15.578 2.85596 16.3141 3.23893 16.9622C4.49004 19.0878 7.26115 19.8155 9.42782 18.5889L14.33 15.8111L14.4367 9.59333M17.1623 17.2555C17.9196 17.2262 18.6576 17.008 19.3091 16.6206C19.9605 16.2333 20.5048 15.6892 20.8922 15.0378C22.1434 12.9122 21.4011 10.1933 19.2345 8.96667L14.3311 6.18889L8.71004 9.25M5.83893 4.74445C5.08139 4.77357 4.34316 4.99174 3.69149 5.37909C3.03981 5.76645 2.4954 6.31068 2.10782 6.96222C0.856714 9.08889 1.59894 11.8067 3.7656 13.0333L8.66893 15.8111L14.2778 12.7556"
      stroke="black"
      strokeWidth="1.66666"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Header() {
  const [isOpen, setIsOpen] = useState(false);
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
    // <header className="h-15 flex items-center justify-between px-6 fixed w-full top-0 z-50 bg-white/80 shadow-md backdrop-blur-md">
    <header className="bg-[#102B39] w-fall max-h-[90px] rounded-b-[40px] flex">
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
            <li>
              <Link
                href="/CompaniesPage"
                className="hover:text-blue-500 font-medium"
              >
                Companies
              </Link>
            </li>
            <li>
              <Link
                href="/Articels"
                className="hover:text-blue-500 font-medium"
              >
                Articles
              </Link>
            </li>
            <li>
              <Link
                href="/ContactUs"
                className="hover:text-blue-500 font-medium"
              >
                Contact Us
              </Link>
            </li>
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
              ></button>
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

          {isOpen && <SideNavbar closeNav={closeNav} isOpen={isOpen} />}
        </div>
      </div>
    </header>
  );
}

export default Header;
