import type { MetadataRoute } from "next";
import { siteUrl } from "./lib/seo/site";

/** Public pages are crawlable; account areas and the API are not. */
export default function robots(): MetadataRoute.Robots {
  const SITE_URL = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // Signed-in areas (nothing indexable behind them).
          "/Dashboard", "/RecruiterDashboard", "/AdminDashboard", "/Settings", "/settings", "/messages", "/notifications", "/onboarding",
          "/interview-prep/", "/practice", "/referrals", "/ResumeAI",
          "/Login", "/SignUp", "/PasswordReset",
          // Removed employer pages — harmless once the folders are gone, keeps stale crawls out meanwhile.
          "/EmployerDashboard", "/EmplopyerSettings",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
