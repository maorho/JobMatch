/** Navigation shared by the header and the mobile drawer. */
export const NAV_LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/Companies", label: "Companies" },
  { href: "/interview-questions", label: "Interview Qs" },
  { href: "/practice", label: "Practice" },
  { href: "/Articels", label: "Articles" },
  { href: "/ContactUs", label: "Contact" },
];

/** Where "my dashboard" points for this account. */
export function dashboardHref(user: any): string {
  if (user?.admin) return "/AdminDashboard";
  if (user?.recruiter) return "/RecruiterDashboard";
  return "/Dashboard";
}

export function userInitial(user: any): string {
  const s: string = user?.fullname || user?.username || "";
  return s.trim().charAt(0).toUpperCase() || "U";
}
