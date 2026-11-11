import { NextResponse, type NextRequest } from "next/server";

/**
 * The product's features are for signed-in people: anyone without a session
 * cookie who opens one of these pages is sent to sign in (and back here after).
 * The public surface stays public: landing, the job catalogue and job pages,
 * articles, interview-question hubs, legal pages. API routes check the JWT
 * themselves; this only decides which pages render for a visitor.
 */
export const GATED_PREFIXES = ["/ResumeAI", "/interview-prep", "/practice", "/messages", "/notifications", "/referrals", "/Dashboard", "/onboarding", "/Settings", "/RecruiterDashboard", "/AdminDashboard"] as const;
const PARTNER_DASHBOARD = /^\/partners\/[^/]+\/dashboard(\/|$)/;

export function isGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || PARTNER_DASHBOARD.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isGatedPath(pathname)) return NextResponse.next();
  // Presence of the cookie is enough to let the page render; the page's own API calls verify the token.
  if (request.cookies.get("token")?.value) return NextResponse.next();
  const login = new URL("/Login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/ResumeAI/:path*", "/interview-prep/:path*", "/practice/:path*", "/messages/:path*", "/notifications/:path*", "/referrals/:path*", "/Dashboard/:path*", "/onboarding/:path*", "/Settings/:path*", "/RecruiterDashboard/:path*", "/AdminDashboard/:path*", "/partners/:slug/dashboard/:path*"],
};
