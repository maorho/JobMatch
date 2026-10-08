import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  isAtsHost,
  resolveLogoDomain,
  guessDomainFromName,
  getLogoUrl,
} from "@/app/lib/scout/logo";

describe("normalizeDomain", () => {
  it("strips protocol, path, query and www", () => {
    expect(normalizeDomain("https://www.Monday.com/careers?x=1")).toBe("monday.com");
  });
  it("strips career-portal subdomains to the root domain", () => {
    expect(normalizeDomain("jobs.intel.com")).toBe("intel.com");
    expect(normalizeDomain("careers.gong.io")).toBe("gong.io");
    expect(normalizeDomain("boards.greenhouse.io")).toBe("greenhouse.io");
  });
  it("is safe on empty input", () => {
    expect(normalizeDomain("")).toBe("");
  });
});

describe("isAtsHost / resolveLogoDomain", () => {
  it("recognises shared ATS hosts", () => {
    expect(isAtsHost("comeet.com")).toBe(true);
    expect(isAtsHost("job-boards.greenhouse.io")).toBe(true);
    expect(isAtsHost("sec.wd3.myworkdayjobs.com")).toBe(true);
    expect(isAtsHost("wix.com")).toBe(false);
  });

  it("never gives two companies the same ATS logo", () => {
    const a = resolveLogoDomain("comeet.com", "Coralogix");
    const b = resolveLogoDomain("comeet.com", "Team8");
    expect(a).toBe("coralogix.com");
    expect(b).toBe("team8.com");
    expect(a).not.toBe(b);
  });

  it("keeps a real company domain and guesses when missing", () => {
    expect(resolveLogoDomain("https://careers.wix.com", "Wix")).toBe("wix.com");
    expect(resolveLogoDomain(undefined, "Aqua Security")).toBe("aquasecurity.com");
    expect(guessDomainFromName("")).toBe("");
  });

  it("builds a logo URL only when there is a domain", () => {
    expect(getLogoUrl("intel.com")).toContain("intel.com");
    expect(getLogoUrl("")).toBe("");
  });
});
