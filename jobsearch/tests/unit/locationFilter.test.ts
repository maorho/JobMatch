import { describe, it, expect } from "vitest";
import { isIsraelOrRemote } from "@/app/lib/scout/locationFilter";

describe("isIsraelOrRemote", () => {
  it("keeps Israeli postings by country code or name", () => {
    expect(isIsraelOrRemote({ city: "Tel Aviv", country: "IL" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Haifa", country: "Israel" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Herzliya", country: "" })).toBe(true);
    expect(isIsraelOrRemote({ city: "", country: "ISR" })).toBe(true);
    expect(isIsraelOrRemote({ city: "ירושלים", country: "ישראל" })).toBe(true);
  });

  it("keeps remote postings anywhere", () => {
    expect(isIsraelOrRemote({ city: "Remote", country: "United States" })).toBe(true);
    expect(isIsraelOrRemote({ city: "London", country: "UK", title: "Engineer (Remote)" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Work from home" })).toBe(true);
  });

  it("drops non-Israel, non-remote postings", () => {
    expect(isIsraelOrRemote({ city: "New York", country: "US" })).toBe(false);
    expect(isIsraelOrRemote({ city: "Vilnius", country: "Lithuania" })).toBe(false);
    expect(isIsraelOrRemote({ city: "", country: "Unknown" })).toBe(false);
    expect(isIsraelOrRemote({})).toBe(false);
  });

  it("does not match on substrings of other words", () => {
    // "remoteness" / "Israeli" inside unrelated words shouldn't flip the filter
    // unless it's a real location signal; "Carmel-by-the-Sea" is not Israel.
    expect(isIsraelOrRemote({ city: "Carmel-by-the-Sea", country: "US" })).toBe(false);
  });

  it("only reads the first 600 chars of the description", () => {
    const longDesc = "x".repeat(700) + " remote";
    expect(isIsraelOrRemote({ city: "Austin", country: "US", description: longDesc })).toBe(false);
  });

  it("knows the Israeli cities ATS feeds actually use, with loose apostrophes and hyphens", () => {
    const cities = [
      "Rosh Haayin", "Rosh Ha'ayin", "Rosh Ha-Ayin", "Hod Hasharon", "Hod HaSharon", "Kiryat Ono", "Bnei Brak", "Or Yehuda", "Yokneam", "Yokne'am", "Yoqneam",
      "Kfar Saba", "Kfar Sava", "Ra'anana", "Raanana", "Modi'in", "Modiin", "Rehovot", "Ness Ziona", "Nes Ziona", "Yavne", "Ashdod", "Ashkelon",
      "Beer Sheva", "Be'er Sheva", "Beersheba", "Beer-Sheva", "Nazareth", "Karmiel", "Migdal HaEmek", "Migdal Ha'emek", "Caesarea", "Binyamina", "Airport City",
      "Kiryat Gat", "Lod", "Ramla", "Rishon LeZion", "Rishon Lezion", "Rishon LeTsiyon", "Holon", "Bat Yam", "Givatayim", "Ramat Gan", "Ramat-Gan",
      "Petah Tikva", "Petach Tikvah", "Petah Tiqwa", "Herzliya", "Herzlia", "Hertzliya", "Herzliya Pituach", "Netanya", "Hadera", "Haifa", "Hefa",
      "Tirat Carmel", "Nesher", "Jerusalem", "Yerushalayim", "Eilat", "Sderot", "Tel Aviv-Yafo", "Tel-Aviv", "TEL AVIV",
    ];
    for (const city of cities) expect(isIsraelOrRemote({ city, country: "" }), city).toBe(true);
    for (const city of ["ראש העין", "הוד השרון", "קרית אונו", "בני ברק", "ראשון לציון", "בת ים", "גבעתיים", "נס ציונה"]) expect(isIsraelOrRemote({ city, country: "" }), city).toBe(true);
    // Still not Israel.
    expect(isIsraelOrRemote({ city: "Lodz", country: "Poland" })).toBe(false);
    expect(isIsraelOrRemote({ city: "Hadersfield", country: "UK" })).toBe(false);
  });

  it("does not treat a negated remote mention as remote", () => {
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "This is not a remote position." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "No remote work. On-site only." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Non-remote role, office based" })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "On-site only" })).toBe(false);
    expect(isIsraelOrRemote({ city: "ברלין", country: "גרמניה", description: "לא מרחוק" })).toBe(false);
    // A real remote signal next to a negated one still counts.
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Not remote-only: hybrid, remote 3 days a week" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Remote", country: "Germany" })).toBe(true);
  });

  it("does not read 'acre' / 'Arad' in free text or abroad as Israel, but keeps them as a short Israeli location", () => {
    expect(isIsraelOrRemote({ city: "Austin", country: "US", description: "Our 175-acre campus has a gym." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Arad", country: "Romania" })).toBe(false);
    expect(isIsraelOrRemote({ city: "", country: "", title: "Engineer", description: "Offices in Arad, Romania" })).toBe(false);
    expect(isIsraelOrRemote({ city: "Arad", country: "" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Acre", country: "Unknown" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Acre", country: "IL" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Akko", country: "" })).toBe(true); // the unambiguous spelling still matches anywhere
  });

  it("treats a remote mention negated after the word as not remote", () => {
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Remote work is not available for this role." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Remote isn't possible here." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "WFH is not offered. Office in Mitte." })).toBe(false);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Remote options are currently unavailable" })).toBe(false);
    // A negation in another sentence does not cancel a real remote signal.
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Fully remote. Relocation is not available." })).toBe(true);
  });
});
