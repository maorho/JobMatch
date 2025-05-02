import Link from "next/link";
import React from "react";

function Footer() {
  return (
    <footer className="py-2 bg-blue-900 sticky bottom-0 z-10">
      <ul className="ml-10 text-white">
        <li>Company</li>
        <li>
          <Link href="./About">About</Link>
        </li>
        <li>
          <Link href="./TermsOfConditions">Terms Of Conditions</Link>
        </li>
      </ul>
    </footer>
  );
}

export default Footer;
