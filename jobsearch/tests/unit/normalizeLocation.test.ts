import { describe, it, expect } from "vitest";
import { normalizeLocation, canonicalCountry } from "@/app/lib/locations/normalizeLocation";

const n = (city: string, country = "") => normalizeLocation({ city, country });

describe("normalizeLocation — Israel", () => {
  it("canonicalises Israeli cities and country codes in any case", () => {
    expect(n("Tel Aviv-Yafo", "IL")).toMatchObject({ city: "Tel Aviv", country: "Israel", remote: false, confidence: "high" });
    expect(n("Tel Aviv", "il")).toMatchObject({ city: "Tel Aviv", country: "Israel" });
    expect(n("Haifa", "israel")).toMatchObject({ city: "Haifa", country: "Israel" });
    expect(n("Raanana", "IL")).toMatchObject({ city: "Ra'anana", country: "Israel" });
    expect(n("Tel Aviv District", "Israel")).toMatchObject({ city: "Tel Aviv", country: "Israel" });
    expect(n("", "Israel")).toMatchObject({ city: "", country: "Israel", confidence: "high" });
  });

  it("reads Hebrew cities and agency regions", () => {
    expect(n("ירושלים", "Israel")).toMatchObject({ city: "Jerusalem", country: "Israel" });
    expect(n("מרכז", "Israel")).toMatchObject({ city: "", country: "Israel", region: "Center" });
    expect(n("שפלה", "")).toMatchObject({ country: "Israel", region: "Shfela" });
    expect(n("תל אביב", "")).toMatchObject({ city: "Tel Aviv", country: "Israel" });
  });

  it("handles 'Israel - Raanana', 'Tel Aviv/ Netanya', hybrid notes and remote-in-Israel", () => {
    expect(n("Israel - Raanana", "Unknown")).toMatchObject({ city: "Ra'anana", country: "Israel" });
    expect(n("Tel Aviv/ Netanya", "Israel")).toMatchObject({ city: "Tel Aviv", country: "Israel" });
    expect(n("Israel - Hybrid (3 days/week in office required)", "Unknown")).toMatchObject({ city: "", country: "Israel", remote: false });
    expect(n("Tel Aviv (Remote)", "Unknown")).toMatchObject({ city: "Tel Aviv", country: "Israel", remote: true });
  });

  it("drops street addresses instead of calling them cities", () => {
    // The ATS put the street in the city field and the city in the country field.
    expect(n("21 Ha'Arba'a St.", "Tel Aviv")).toMatchObject({ city: "Tel Aviv", country: "Israel" });
    const r = n("21 Ha'Arba'a St.", "");
    expect(r.city).toBe("");
    expect(r.country).toBe("");
    expect(r.confidence).toBe("low"); // → LLM stage
  });
});

describe("normalizeLocation — remote & multi-location strings from Greenhouse/Ashby", () => {
  it("resolves the many spellings of 'remote in the US'", () => {
    for (const s of ["Remote - US", "Remote - USA", "Remote US", "Remote - United States", "United States - Remote", "US-Remote", "Remote-US", "Remote U.S.", "USA - Remote", "Remote in the US"]) {
      const r = n(s, "Unknown");
      expect(r, s).toMatchObject({ country: "United States", remote: true });
      expect(r.city, s).toBe("");
    }
    expect(n("Remote", "US")).toMatchObject({ country: "United States", remote: true });
    expect(n("Remote", "Unknown")).toMatchObject({ country: "", remote: true, confidence: "medium" });
  });

  it("uses only the first location of a list", () => {
    expect(n("Alabama; Remote - Virginia; Remote - Washington D.C.", "Unknown")).toMatchObject({ country: "United States", region: "Alabama", city: "" });
    expect(n("US-NYC; US-San Francisco; US-Seattle; US-Remote", "Unknown")).toMatchObject({ city: "New York", country: "United States" });
    expect(n("Poland - Remote OR Romania - Remote", "Unknown")).toMatchObject({ country: "Poland", remote: true });
    expect(n("Madrid; Milan", "France")).toMatchObject({ city: "Madrid", country: "France" }); // explicit country field wins
  });

  it("repairs Greenhouse's bad comma split ('NY • United States', 'or NS Only)')", () => {
    expect(n("San Francisco", "NY • United States")).toMatchObject({ city: "San Francisco", country: "United States" });
    expect(n("Canada - Remote (ON", "or NS Only)")).toMatchObject({ country: "Canada", region: "Ontario", remote: true, city: "" });
    expect(n("San Francisco", "or Remote within Canada or United States")).toMatchObject({ city: "San Francisco", country: "United States" });
  });

  it("recognises world cities, codes and names", () => {
    expect(n("Amsterdam (Remote)", "Unknown")).toMatchObject({ city: "Amsterdam", country: "Netherlands", remote: true });
    expect(n("London", "GB")).toMatchObject({ city: "London", country: "United Kingdom" });
    expect(n("Remote", "United Kingdom")).toMatchObject({ country: "United Kingdom", remote: true });
    expect(n("Vilnius", "Lithuania")).toMatchObject({ city: "Vilnius", country: "Lithuania" });
    expect(n("Hybrid - New York", "NY")).toMatchObject({ city: "New York", country: "United States", remote: false });
    expect(n("Ottawa, Ontario, Canada (Remote)", "Canada")).toMatchObject({ city: "Ottawa", country: "Canada", region: "Ontario", remote: true });
    expect(n("Arizona", "Unknown")).toMatchObject({ city: "", country: "United States", region: "Arizona" });
    expect(n("", "HU")).toMatchObject({ country: "Hungary" });
    expect(n("", "ie")).toMatchObject({ country: "Ireland" });
    expect(n("", "Illinois")).toMatchObject({ country: "United States", region: "Illinois" });
  });

  it("never reports area words, state codes or provinces as cities", () => {
    for (const s of ["EMEA", "EU", "APAC", "LATAM", "East Coast", "Central", "Distributed", "General", "DNU", "from the US"]) {
      expect(n(s, "Unknown").city, s).toBe("");
    }
    expect(n("Central US", "Unknown")).toMatchObject({ city: "", country: "United States" });
    for (const s of ["AL", "AZ", "CT", "DC"]) expect(n(s, "Unknown"), s).toMatchObject({ city: "", country: "United States" });
    expect(n("BC & ON", "Canada")).toMatchObject({ city: "", country: "Canada", region: "British Columbia" });
    expect(n("EMEA", "Unknown").confidence).toBe("medium"); // positively "no city"
  });

  it("peels country/state codes glued onto a city", () => {
    expect(n("US FL Miami", "Unknown")).toMatchObject({ city: "Miami", country: "United States", region: "Florida" });
    expect(n("US DC", "Unknown")).toMatchObject({ city: "", country: "United States", region: "Washington D.C." });
    expect(n("USA East Coast", "Unknown")).toMatchObject({ city: "", country: "United States" });
    expect(n("Toronto Canada", "Unknown")).toMatchObject({ city: "Toronto", country: "Canada" });
    expect(n("US-New York", "Unknown")).toMatchObject({ city: "New York", country: "United States" });
    expect(n("US National", "Unknown")).toMatchObject({ city: "", country: "United States" });
    expect(n("Warszawa", "PL")).toMatchObject({ city: "Warsaw", country: "Poland" });
    expect(n("SF Bay Area", "US")).toMatchObject({ city: "San Francisco" });
    expect(n("Rishon Letsiyon", "Israel")).toMatchObject({ city: "Rishon LeZion" });
  });

  it("collapses spelling variants of Israeli cities into one facet", () => {
    expect(n("karmiel", "Israel").city).toBe("Karmiel");
    expect(n("Kefar Sava", "IL").city).toBe("Kfar Saba");
    expect(n("Bnei Berak", "IL").city).toBe("Bnei Brak");
    expect(n("Giv‘atayim", "Israel").city).toBe("Givatayim");
    expect(n("some town", "Israel").city).toBe("Some Town");
  });

  it("treats IL as Israel unless clearly inside the US", () => {
    expect(n("Chicago", "IL")).toMatchObject({ city: "Chicago", country: "United States", region: "Illinois" });
    expect(n("Tel Aviv", "IL")).toMatchObject({ country: "Israel" });
  });

  it("is safe on junk and empty input", () => {
    expect(n("", "")).toMatchObject({ raw: "", city: "", country: "", confidence: "low" });
    expect(n("N/A", "Unknown")).toMatchObject({ city: "", country: "" });
    expect(canonicalCountry("usa")).toBe("United States");
    expect(canonicalCountry("nowhere")).toBe("");
  });
});
