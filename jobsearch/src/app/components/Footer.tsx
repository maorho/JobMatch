import Link from "next/link";
import React from "react";

function Footer() {
  return (
    <div className="py-6 bg-blue-900">
      <footer>
        <ul className="ml-3 text-white">
          <li>Company</li>
          <li>
            <Link href="./About">About</Link>
          </li>
          <li>
            <Link href="./TermsOfConditions">Terms Of Conditions</Link>
          </li>
        </ul>
      </footer>
    </div>
  );
}

export default Footer;
