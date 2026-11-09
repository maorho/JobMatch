/** Navigation shared by the header and the mobile drawer. */
export const NAV_LINKS = [
  { href: "/", key: "nav.jobs" },
  { href: "/Companies", key: "nav.companies" },
  { href: "/interview-questions", key: "nav.interviewQs" },
  { href: "/practice", key: "nav.practice" },
  { href: "/Articels", key: "nav.articles" },
  { href: "/ContactUs", key: "nav.contact" },
] as const;

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
