import Link from "next/link";
import React from "react";

interface UserProps {
  username: string;
  email: string;
}

const UserSettings: React.FC<UserProps> = ({ username, email }) => {
  return (
    <div>
      <h2>UserSettings</h2>
      <Link href="./PasswordReset">PasswordReset</Link>
    </div>
  );
};

export default UserSettings;
