import { describe, it, expect } from "vitest";
import { safeNextPath, loginHref } from "@/app/lib/hooks/nextPath";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/Dashboard")).toBe("/Dashboard");
    expect(safeNextPath("/job/external/abc?x=1")).toBe("/job/external/abc?x=1");
  });

  it("rejects off-site and malformed destinations", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("never loops back into the auth pages", () => {
    expect(safeNextPath("/Login?next=/x", "/Dashboard")).toBe("/Dashboard");
    expect(safeNextPath("/SignUp")).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath(undefined, "/RecruiterDashboard")).toBe("/RecruiterDashboard");
    expect(safeNextPath("http://x", "")).toBe("");
  });
});

describe("loginHref", () => {
  it("encodes the current path as ?next=", () => {
    expect(loginHref("/job/external/abc")).toBe("/Login?next=%2Fjob%2Fexternal%2Fabc");
  });
  it("omits next for the home page and unsafe paths", () => {
    expect(loginHref("/")).toBe("/Login");
    expect(loginHref("//evil")).toBe("/Login");
    expect(loginHref("/Login")).toBe("/Login");
  });
});
