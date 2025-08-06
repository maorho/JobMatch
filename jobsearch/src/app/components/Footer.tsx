import Link from "next/link";
import React from "react";

function Footer() {
  return (
    <footer className="py-2 bg-white shadow-2xl mt-10 w-full relative bottom-0 z-10">
      <ul className="ml-10">
        <li className="hover:text-blue-500 font-medium">Company</li>
        <li>
          <Link href="./About" className="hover:text-blue-500 font-medium">
            About
          </Link>
        </li>
        <li>
          <Link
            href="./TermsOfConditions"
            className="hover:text-blue-500 font-medium"
          >
            Terms Of Conditions
          </Link>
        </li>
      </ul>
    </footer>
  );
}

export default Footer;
