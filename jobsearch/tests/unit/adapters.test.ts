import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { google } from "@/app/lib/scout/adapters/google";
import { apple } from "@/app/lib/scout/adapters/apple";
import { html } from "@/app/lib/scout/adapters/html";
import { comeet } from "@/app/lib/scout/adapters/comeet";
import { greenhouse } from "@/app/lib/scout/adapters/greenhouse";

/**
 * Adapter parsers against inline fixtures, with global fetch stubbed per URL.
 * No network: a fixture is the exact shape each site returned when it was
 * reverse-engineered, so a regression here means the parser broke, not the site.
 */
type Reply = { status?: number; body: string | object; contentType?: string };
function stubFetch(routes: Record<string, Reply | ((url: string) => Reply)>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? (typeof routes[key] === "function" ? (routes[key] as any)(url) : routes[key]) : { status: 404, body: "" };
    const status = r.status ?? 200;
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      headers: new Headers({ "content-type": r.contentType ?? (typeof r.body === "string" ? "text/html" : "application/json") }),
      text: async () => text,
      json: async () => (typeof r.body === "string" ? JSON.parse(r.body) : r.body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------- Google
function googleRow(id: string, title: string, loc = ["Tel Aviv, Israel", ["addr"], "Tel Aviv-Yafo", null, "Tel Aviv District", "IL"]) {
  return [id, title, "https://www.google.com/about/careers/applications/signin?jobId=x",
    [null, "<ul><li>Build verification environments</li></ul>"],
    [null, "<ul><li>BSc in EE</li></ul>"], "projects/x", null, "Google", "en-US",
    [loc], [null, "<p>About the team</p>"], [2, 3], [1789076304, 0], [1790696223, 0], [1790696223, 0],
    null, null, null, null, [null, "<ul><li>MSc preferred</li></ul>"], 2];
}
function googlePage(rows: any[]) {
  return `<html><script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify([[rows]])}, sideChannel: {}});</script></html>`;
}

describe("google adapter", () => {
  it("maps embedded rows and stops when a page is short", async () => {
    const { calls } = stubFetch({ "jobs/results": { body: googlePage([googleRow("127122114053317318", "Senior Edge-AI Engineer")]) } });
    const out = await google("Israel");
    expect(calls).toHaveLength(1); // 1 row < page size → no page 2
    expect(out).toHaveLength(1);
    const j = out[0];
    expect(j.sourceJobId).toBe("127122114053317318");
    expect(j.title).toBe("Senior Edge-AI Engineer");
    expect(j.company).toBe("Google");
    expect(j.city).toBe("Tel Aviv-Yafo");
    expect(j.country).toBe("IL");
    expect(j.applyUrl).toMatch(/jobs\/results\/127122114053317318$/);
    expect(j.postedAt).toBeInstanceOf(Date);
    expect(j.description).toContain("About the team");
    expect(j.description).toContain("Minimum qualifications");
    expect(j.description).toContain("Build verification environments");
  });

  it("prefers the Israeli office on multi-location postings", async () => {
    const row = googleRow("222222222222222222", "SRE");
    row[9] = [["Dublin, Ireland", ["a"], "Dublin", null, "", "IE"], ["Haifa, Israel", ["b"], "Haifa", null, "", "IL"]];
    stubFetch({ "jobs/results": { body: googlePage([row]) } });
    const [j] = await google("Israel");
    expect(j.city).toBe("Haifa");
    expect(j.country).toBe("IL");
  });

  it("throws on an HTTP error for the first page", async () => {
    stubFetch({ "jobs/results": { status: 503, body: "" } });
    await expect(google("Israel")).rejects.toThrow(/HTTP 503/);
  });

  it("returns nothing when the page has no data blob", async () => {
    stubFetch({ "jobs/results": { body: "<html>no data</html>" } });
    expect(await google("Israel")).toEqual([]);
  });
});

// ---------------------------------------------------------------- Apple
function applePage(results: object[], total = results.length) {
  const payload = { loaderData: { search: { searchResults: results, totalRecords: total } } };
  // The page embeds JSON.parse("<escaped JS string>").
  return `<html><script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(payload))});</script></html>`;
}

describe("apple adapter", () => {
  it("parses hydration data and builds public job URLs", async () => {
    stubFetch({ "jobs.apple.com": { body: applePage([{ id: "200687696-0881", positionId: "200687696", postingTitle: "Wireless SoC Engineer", jobSummary: "Design SoCs", locations: [{ name: "Herzliya" }], postDateInGMT: "2026-10-07T00:00:00.000Z", transformedPostingTitle: "wireless-soc-engineer", homeOffice: false }]) } });
    const out = await apple("israel-ISR");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sourceJobId: "200687696-0881", title: "Wireless SoC Engineer", company: "Apple", city: "Herzliya", country: "Israel", description: "Design SoCs" });
    expect(out[0].applyUrl).toBe("https://jobs.apple.com/en-il/details/200687696/wireless-soc-engineer");
    expect(out[0].postedAt?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("blanks the city for country-level postings and flags home office", async () => {
    stubFetch({ "jobs.apple.com": { body: applePage([{ id: "1", positionId: "1", postingTitle: "X", locations: [{ name: "Israel" }], homeOffice: true }]) } });
    const [j] = await apple("israel-ISR");
    expect(j.city).toBe("Remote");
    expect(j.country).toBe("Israel");
  });

  it("paginates until totalRecords is reached", async () => {
    const page = (n: number) => applePage(Array.from({ length: 20 }, (_, i) => ({ id: `p${n}-${i}`, positionId: `${n}${i}`, postingTitle: `Job ${n}-${i}`, locations: [{ name: "Haifa" }] })), 40);
    const { calls } = stubFetch({ "page=1": { body: page(1) }, "page=2": { body: page(2) } });
    const out = await apple("israel-ISR");
    expect(out).toHaveLength(40);
    expect(calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- HTML board
const LISTING = `<html><body>
  <div class="inner font_s"><h3 class="title_job"><a href="/jobs/jobpage?positionId=1">Full Stack Developer</a></h3><div class="desc">Node + React</div></div>
  <div class="inner font_s"><h3 class="title_job"><a href="/jobs/jobpage?positionId=2">מהנדס/ת תוכנה</a></h3><div class="desc">C++</div></div>
  <div class="inner font_s"><h3 class="title_job"><a href="/jobs/jobpage?positionId=1">Full Stack Developer (dup)</a></h3></div>
</body></html>`;

describe("html adapter", () => {
  it("extracts items, resolves relative links and dedups by URL", async () => {
    stubFetch({ "/list": { body: LISTING } });
    const out = await html("https://agency.example/list", JSON.stringify({ item: "div.inner.font_s", title: "h3.title_job a", link: "h3.title_job a", desc: ".desc", company: "Agency", country: "Israel" }));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: "Full Stack Developer", company: "Agency", country: "Israel", description: "Node + React" });
    expect(out[0].applyUrl).toBe("https://agency.example/jobs/jobpage?positionId=1");
    expect(out[0].sourceJobId).toBe(out[0].applyUrl);
    expect(out[1].title).toBe("מהנדס/ת תוכנה");
  });

  it("enriches from detail pages and reads JSON-wrapped HTML (admin-ajax)", async () => {
    const wrapped = { success: true, data: { html: `<button class="jobs-post"><div class="job-name">חשמלאי/ת</div><a href="/?job=x">פרטים</a><div class="hidden-content">תיאור</div></button>` } };
    stubFetch({ "admin-ajax.php": { body: wrapped }, "/?job=x": { body: `<html><div class="full">Full description here</div></html>` } });
    const out = await html("https://careers.example/wp-admin/admin-ajax.php?action=get_job_posts", JSON.stringify({ jsonHtmlKey: "data", item: "button.jobs-post", title: ".job-name", link: "a[href*='?job=']", desc: ".hidden-content", detail: { desc: ".full" }, company: "Mekorot" }));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("חשמלאי/ת");
    expect(out[0].description).toBe("Full description here"); // detail overrides listing
  });

  it("fails loudly on a bad or missing config", async () => {
    stubFetch({});
    await expect(html("https://x.example", undefined)).rejects.toThrow(/config/);
    await expect(html("https://x.example", "{not json")).rejects.toThrow(/JSON/);
    await expect(html("https://x.example", JSON.stringify({}))).rejects.toThrow(/item/);
  });

  it("throws when the listing returns an error status", async () => {
    stubFetch({ "/list": { status: 500, body: "" } });
    await expect(html("https://agency.example/list", JSON.stringify({ item: "div" }))).rejects.toThrow(/HTTP 500/);
  });
});

// ---------------------------------------------------------------- Comeet & Greenhouse
describe("comeet adapter", () => {
  it("requires a token and maps experience_level into seniority", async () => {
    await expect(comeet("06.004", undefined)).rejects.toThrow(/token/);
    stubFetch({ "careers-api": { body: [{ uid: "p1", name: "Junior QA", location: { city: "Tel Aviv", country: "IL" }, experience_level: "Entry-level", details: [{ name: "Description", value: "<p>Test things</p>" }], url_comeet_hosted_page: "https://www.comeet.com/jobs/x/p1" }, { uid: "p2", name: "Remote Dev", location: { is_remote: true }, experience_level: "Senior" }] } });
    const out = await comeet("06.004", "TOKEN");
    expect(out).toHaveLength(2);
    // Section names are kept as headings so the text stays structured.
    expect(out[0]).toMatchObject({ sourceJobId: "p1", title: "Junior QA", city: "Tel Aviv", country: "IL", seniority: ["Entry-level"], description: "Description\nTest things" });
    expect(out[1]).toMatchObject({ city: "Remote", country: "Remote", seniority: ["Senior"] });
  });
});

describe("greenhouse adapter", () => {
  it("maps the boards API and splits location into city/country", async () => {
    stubFetch({ "boards-api.greenhouse.io": { body: { jobs: [{ id: 42, title: "Backend Engineer", location: { name: "Tel Aviv, Israel" }, content: "&lt;p&gt;Go &amp; Postgres&lt;/p&gt;", absolute_url: "https://boards.greenhouse.io/acme/jobs/42", first_published: "2026-10-01T00:00:00Z" }] } } });
    const [j] = await greenhouse("acme");
    expect(j).toMatchObject({ sourceJobId: "42", title: "Backend Engineer", city: "Tel Aviv", country: "Israel", description: "Go & Postgres", company: "acme" });
    expect(j.postedAt).toBeInstanceOf(Date);
  });

  it("propagates HTTP failures", async () => {
    stubFetch({ "boards-api.greenhouse.io": { status: 404, body: "" } });
    await expect(greenhouse("gone")).rejects.toThrow(/HTTP 404/);
  });
});

describe("workable adapter", () => {
  it("lists the account's jobs and fills descriptions from the detail endpoint", async () => {
    const { workable } = await import("@/app/lib/scout/adapters/workable");
    const fn = vi.fn(async (url: string) => {
      if (url === "https://apply.workable.com/api/v1/widget/accounts/tomax") return new Response(JSON.stringify({ name: "Tomax Think Academy", jobs: [{ title: "Frontend Developer", shortcode: "ABC123", url: "https://apply.workable.com/j/ABC123", application_url: "https://apply.workable.com/j/ABC123/apply", published_on: "2026-03-29", country: "Israel", city: "Kfar Monash", experience: "Entry level" }, { title: "Sales Lead", shortcode: "DEF456", url: "https://apply.workable.com/j/DEF456", country: "Israel", city: "Tel Aviv" }] }), { status: 200 });
      if (url === "https://apply.workable.com/api/v1/widget/accounts/tomax/jobs/ABC123") return new Response(JSON.stringify({ description: "<p>Build the <b>React</b> front.</p>", requirements: "<ul><li>2 years React</li></ul>" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fn);
    const jobs = await workable("tomax");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ sourceJobId: "ABC123", title: "Frontend Developer", company: "Tomax Think Academy", city: "Kfar Monash", country: "Israel", applyUrl: "https://apply.workable.com/j/ABC123/apply", seniority: ["Entry level"] });
    expect(jobs[0].description).toMatch(/Build the React front/);
    expect(jobs[0].description).toMatch(/Requirements[\s\S]*2 years React/);
    expect(jobs[0].postedAt?.toISOString().slice(0, 10)).toBe("2026-03-29");
    expect(jobs[1].description).toBe(""); // detail 404 → listing data kept
    await expect(workable("nope")).rejects.toThrow(/HTTP 404/);
    vi.unstubAllGlobals();
  });
});

describe("eightfold adapter", () => {
  it("pages the Israel search until the count is reached and fills descriptions from the detail endpoint", async () => {
    const { eightfold, eightfoldCity } = await import("@/app/lib/scout/adapters/eightfold");
    expect(eightfoldCity(["Israel, Multiple Locations, Multiple Locations", "Israel, Tel Aviv, Herzliya"])).toBe("Herzliya");
    expect(eightfoldCity("Israel, Tel Aviv, Tel Aviv")).toBe("Tel Aviv");
    expect(eightfoldCity([])).toBe("");
    const pos = (id: number, name: string) => ({ id, displayJobId: String(id), name, locations: ["Israel, Tel Aviv, Herzliya"], postedTs: 1789732215, department: "Software Engineering", positionUrl: `/careers/job/${id}` });
    const { calls } = stubFetch({
      "api/pcsx/search": (url) => {
        const start = Number(new URL(url).searchParams.get("start"));
        if (start === 0) return { body: { data: { count: 12, positions: Array.from({ length: 10 }, (_, i) => pos(100 + i, `Engineer ${i}`)) } } };
        if (start === 10) return { body: { data: { count: 12, positions: [pos(200, "AI Engineer"), pos(201, "Data Scientist")] } } };
        return { body: "<!DOCTYPE html>", status: 200 }; // past the end the site answers with HTML
      },
      "api/apply/v2/jobs/200": { body: { id: 200, job_description: "<b>Overview</b><p>Build <i>AI</i> systems.</p>" } },
    });
    const out = await eightfold("apply.careers.microsoft.com", "microsoft.com");
    expect(out).toHaveLength(12);
    expect(calls.filter((c) => c.includes("api/pcsx/search"))).toHaveLength(2); // stopped at the count, no third page
    expect(calls[0]).toContain("https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=Israel&start=0&num=10");
    const ai = out.find((p) => p.sourceJobId === "200")!;
    expect(ai).toMatchObject({ title: "AI Engineer", company: "Microsoft", city: "Herzliya", country: "Israel", applyUrl: "https://apply.careers.microsoft.com/careers/job/200" });
    expect(ai.description).toMatch(/Overview[\s\S]*Build AI systems/);
    expect(ai.postedAt?.toISOString().slice(0, 10)).toBe("2026-09-18");
    expect(out.find((p) => p.sourceJobId === "201")!.description).toBe(""); // detail 404 → listing data kept
  });
});
