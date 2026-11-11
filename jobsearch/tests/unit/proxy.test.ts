import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, isGatedPath, config } from "@/proxy";

const req = (path: string, cookie?: string) => new NextRequest(`https://job-match.test${path}`, { headers: cookie ? { cookie } : {} });

describe("sign-in gate for the product's pages", () => {
  it("knows which pages are for signed-in people only", () => {
    for (const p of ["/ResumeAI", "/interview-prep/external/abc", "/practice", "/practice/123", "/messages", "/notifications", "/referrals", "/Dashboard", "/onboarding", "/Settings", "/RecruiterDashboard", "/AdminDashboard/agents", "/partners/acme/dashboard"]) expect(isGatedPath(p), p).toBe(true);
    for (const p of ["/", "/jobs", "/jobs/in/tel-aviv", "/job/external/abc", "/Articels", "/Articels/x", "/interview-questions/acme", "/Companies", "/partners/acme", "/Login", "/SignUp", "/PrivacyPolicy", "/ResumeAIx"]) expect(isGatedPath(p), p).toBe(false);
    // The matcher covers every gated prefix, so the proxy runs only where it has to.
    for (const p of ["ResumeAI", "interview-prep", "practice", "messages", "notifications", "referrals", "Dashboard", "onboarding", "Settings", "RecruiterDashboard", "AdminDashboard"]) expect(config.matcher.some((m) => m.startsWith(`/${p}/`))).toBe(true);
  });

  it("sends a visitor without a session to sign in and back to the page afterwards", () => {
    const res = proxy(req("/interview-prep/external/abc?stage=hr"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/Login");
    expect(to.searchParams.get("next")).toBe("/interview-prep/external/abc?stage=hr");
  });

  it("lets a signed-in person and public pages through", () => {
    expect(proxy(req("/ResumeAI", "token=abc")).headers.get("location")).toBeNull();
    expect(proxy(req("/jobs")).headers.get("location")).toBeNull();
  });
});
