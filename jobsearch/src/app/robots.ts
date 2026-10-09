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
        disallow: ["/api/", "/Dashboard", "/RecruiterDashboard", "/AdminDashboard", "/Settings", "/messages", "/notifications", "/onboarding", "/interview-prep/", "/ResumeAI", "/Login", "/SignUp", "/PasswordReset", "/EmployerDashboard", "/EmplopyerSettings"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
