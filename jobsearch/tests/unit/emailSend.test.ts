import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail, smtpSecure, resendIdempotencyKey } from "@/app/lib/email/send";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("smtpSecure", () => {
  it("accepts 1/true as on and 0/false as off, like lib/env.ts", () => {
    expect(smtpSecure({ SMTP_SECURE: "1" }, 587)).toBe(true);
    expect(smtpSecure({ SMTP_SECURE: "true" }, 587)).toBe(true);
    expect(smtpSecure({ SMTP_SECURE: "0" }, 465)).toBe(false);
    expect(smtpSecure({ SMTP_SECURE: "false" }, 465)).toBe(false);
  });

  it("defaults to implicit TLS exactly on port 465", () => {
    expect(smtpSecure({}, 465)).toBe(true);
    expect(smtpSecure({}, 587)).toBe(false);
    expect(smtpSecure({ SMTP_SECURE: "" }, 465)).toBe(true);
  });
});

describe("Resend idempotency", () => {
  const mail = { to: "a@example.com", subject: "Reset", html: "<p>x</p>", text: "x" };

  it("keys are stable for the same nonce and differ across nonces", () => {
    expect(resendIdempotencyKey(mail, "n1")).toBe(resendIdempotencyKey(mail, "n1"));
    expect(resendIdempotencyKey(mail, "n1")).not.toBe(resendIdempotencyKey(mail, "n2"));
  });

  it("sends the same Idempotency-Key on the retry after a timeout", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "JobMatch <no-reply@example.com>");
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await sendEmail(mail);
    expect(r).toMatchObject({ sent: true, transport: "resend", id: "msg_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map((c) => (c[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);

    // A second, separate send gets a fresh key.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg_2" }), { status: 200 }));
    await sendEmail(mail);
    expect((fetchMock.mock.calls[2][1].headers as Record<string, string>)["Idempotency-Key"]).not.toBe(keys[0]);
  });
});
