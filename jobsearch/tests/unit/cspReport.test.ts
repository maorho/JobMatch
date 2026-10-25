import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/csp-report/route";

const post = (body: string, type: string) =>
  POST(new NextRequest("http://localhost/api/csp-report", { method: "POST", headers: { "content-type": type }, body }));

afterEach(() => vi.restoreAllMocks());

describe("POST /api/csp-report", () => {
  it("logs a one-line summary of a legacy application/csp-report body (path only) and returns 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(
      JSON.stringify({ "csp-report": { "document-uri": "https://site.test/job/x/1?token=secret", "violated-directive": "script-src-elem", "blocked-uri": "https://evil.test/a.js?q=1" } }),
      "application/csp-report"
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toBe("[csp] script-src-elem blocked https://evil.test/a.js on /job/x/1");
    expect(line).not.toMatch(/secret/);
  });

  it("accepts the Reporting API's application/reports+json array", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(
      JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://site.test/", effectiveDirective: "img-src", blockedURL: "inline" } }, { type: "deprecation", body: {} }]),
      "application/reports+json"
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[csp] img-src blocked inline on /");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("never throws on garbage and ignores other content types", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post("{not json", "application/csp-report")).status).toBe(204);
    expect((await post("hello", "text/plain")).status).toBe(204);
    expect((await post("null", "application/json")).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rate-limits its own logging per instance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify({ "csp-report": { "document-uri": "https://site.test/", "violated-directive": "font-src", "blocked-uri": "data" } });
    for (let i = 0; i < 40; i++) expect((await post(body, "application/csp-report")).status).toBe(204);
    // 20 per minute in total, including the two logged by the earlier tests in this file.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(20);
    expect(warn.mock.calls.length).toBeGreaterThan(0);
  });
});
