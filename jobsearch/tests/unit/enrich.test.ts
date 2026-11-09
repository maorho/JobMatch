import { describe, it, expect } from "vitest";
import { extractExperience, extractTech, extractRequirements, enrich, experienceBucket, titleKey } from "@/app/lib/jobs/enrich";

describe("years of experience", () => {
  it("reads the common English and Hebrew phrasings", () => {
    expect(extractExperience("• 4+ years of related experience in software development")).toEqual({ min: 4, max: null });
    expect(extractExperience("Has 1-4 years of backend or full-stack development experience")).toEqual({ min: 1, max: 4 });
    expect(extractExperience("1–3 years of experience in equity administration")).toEqual({ min: 1, max: 3 });
    expect(extractExperience("At least 5 years of experience in mechanical design")).toEqual({ min: 5, max: null });
    expect(extractExperience("Minimum 6 years of back-end experience")).toEqual({ min: 6, max: null });
    expect(extractExperience("10+ overall years of relevant experience including 4+ years of experience managing")).toEqual({ min: 10, max: null });
    expect(extractExperience("ניסיון של 6 שנים ומעלה ברכש")).toEqual({ min: 6, max: null });
    expect(extractExperience("4 שנות ניסיון בניהול תוכנית ייצור")).toEqual({ min: 4, max: null });
    expect(extractExperience("בעל/ת 2–5 שנות ניסיון להצטרף לצוות")).toEqual({ min: 2, max: 5 });
    expect(extractExperience("שנתיים ניסיון בפיתוח JAVA")).toEqual({ min: 2, max: null });
    expect(extractExperience("at least three years of experience")).toEqual({ min: 3, max: null });
  });

  it("ignores years that are not a requirement, and prefers the phrase that says experience", () => {
    expect(extractExperience("Ranked as the #1 MMP by G2 for 3 years in a row")).toBeNull();
    expect(extractExperience("we reached $100M ARR within just 6 years of launching")).toBeNull();
    expect(extractExperience("Founded 12 years ago. Requirements: 2+ years of experience with React")).toEqual({ min: 2, max: null });
    expect(extractExperience("No experience needed, we train you")).toBeNull();
  });

  it("buckets by the minimum", () => {
    expect(experienceBucket(0)).toBe("0-2");
    expect(experienceBucket(2)).toBe("0-2");
    expect(experienceBucket(3)).toBe("3-5");
    expect(experienceBucket(5)).toBe("5-10");
    expect(experienceBucket(12)).toBe("10+");
    expect(experienceBucket(null)).toBeNull();
  });
});

describe("technologies", () => {
  it("finds names with their aliases, title first, each once, and skips look-alikes", () => {
    const t = extractTech("Senior Backend Engineer (Go)", "Experience with Golang, k8s, Postgres and React.js. We excel in teamwork. Networking events monthly. Node.js a plus. JavaScript and TypeScript.");
    expect(t.slice(0, 1)).toEqual(["Go"]);
    expect(t).toEqual(expect.arrayContaining(["Kubernetes", "PostgreSQL", "React", "Node.js", "JavaScript", "TypeScript"]));
    expect(t).not.toContain("Excel"); // "we excel" is a verb
    expect(t).not.toContain("Networking"); // social networking
    expect(t).not.toContain("Java"); // JavaScript is not Java
    expect(new Set(t).size).toBe(t.length);
  });
  it("Java vs JavaScript, C++ vs C#, React vs React Native", () => {
    expect(extractTech("", "Java and Spring Boot")).toEqual(expect.arrayContaining(["Java", "Spring"]));
    expect(extractTech("", "Java and Spring Boot")).not.toContain("JavaScript");
    expect(extractTech("", "C++ and C# on .NET")).toEqual(expect.arrayContaining(["C++", "C#", ".NET"]));
    expect(extractTech("", "React Native mobile apps")).toContain("React Native");
  });
});

describe("requirements list", () => {
  const desc = `About the role
We build payments.

Requirements:
• 3+ years of experience with Python
• Experience with AWS and Kubernetes
• BSc in Computer Science
Required:
• Fluent English

Nice to have:
• Go
Responsibilities:
• Ship features`;
  it("takes the bullets under the requirements heading and stops at the next section", () => {
    const r = extractRequirements(desc);
    expect(r[0]).toBe("3+ years of experience with Python");
    expect(r).toContain("Fluent English");
    expect(r).not.toContain("Required:");
    expect(r).not.toContain("Go");
    expect(r).not.toContain("Ship features");
  });
  it("reads Hebrew headings and falls back to requirement-like bullets", () => {
    expect(extractRequirements("דרישות:\n- שנתיים ניסיון ב-Java\n- תואר ראשון\nיתרון:\n- Kafka")).toEqual(["שנתיים ניסיון ב-Java", "תואר ראשון"]);
    expect(extractRequirements("We are great.\n• 5 years of experience in sales\n• Lunch is free\n• Knowledge of SQL")).toEqual(["5 years of experience in sales", "Knowledge of SQL"]);
    expect(extractRequirements("")).toEqual([]);
  });
});

describe("enrich + titleKey", () => {
  it("bundles the three and normalises titles for repost matching", () => {
    const e = enrich("Backend Developer (Java)", "Requirements:\n• 2+ years of experience with Java and Kafka");
    expect(e).toMatchObject({ experienceMin: 2, experienceMax: null });
    expect(e.tech).toEqual(expect.arrayContaining(["Java", "Kafka"]));
    expect(e.requirements).toEqual(["2+ years of experience with Java and Kafka"]);
    expect(titleKey("Senior Backend Developer (Java) - 1987")).toBe("senior backend developer");
    expect(titleKey("Backend Developer  (m/f)")).toBe("backend developer");
  });
});
