import Link from "next/link";
import React from "react";

function Header() {
  return (
    <div className="p-3 bg-gradient-to-r from-blue-100 to-blue-500">
      <ul className="flex text-black">
        <li className="mr-2.5">
          <Link href="./">Logo</Link>
        </li>
        <li className="mr-2">
          <Link href="./About">About</Link>
        </li>
        <li className="mr-2">
          <Link href="./LoginPage">Login</Link>
        </li>
      </ul>
    </div>
  );
}

export default Header;
