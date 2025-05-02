import Link from "next/link";
import React from "react";

interface SideNavbarProps {
  closeNav: () => void;
  isOpen: boolean;
}

const SideNavbar: React.FC<SideNavbarProps> = ({ closeNav, isOpen }) => {
  return (
    <div
      className={`fixed top-0 right-0 h-full bg-blue-500 w-32 p-5 mt-13 transform transition-all duration-3000 ease-in-out
        ${isOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}
      `}
    >
      <ul className="space-y-6">
        <li>
          <Link
            href="./LoginPage"
            className="text-lg font-semibold text-white hover:text-blue-400"
          >
            Login
          </Link>
        </li>
        <li>
          <Link
            href="./SignUp"
            className="text-lg font-semibold text-white hover:text-blue-400"
          >
            SignUp
          </Link>
        </li>
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
