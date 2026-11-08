import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { registerSchema } from "@/lib/validators";

const athlete = {
  name: "Test Athlete",
  email: "athlete@example.test",
  password: "correct-horse-battery",
  role: "ATHLETE",
  age: 19,
  primarySport: "soccer",
  position: "GK",
  competitionLevel: "academy",
};

describe("register form defaults", () => {
  const form = readFileSync("src/components/forms/register-form.tsx", "utf8");

  it("leaves both benchmarking consents unchecked until the athlete opts in", () => {
    expect(form).not.toContain("defaultChecked");
    expect(form).toMatch(/name="shareInBenchmarks"/);
    expect(form).toMatch(/name="anonymizeForBenchmark"/);
  });

  it("starts age and position blank, with a placeholder option for position", () => {
    expect(form).toContain('useState("")');
    expect(form).not.toContain("getDefaultPositionForSport");
    expect(form).toContain('<option value="">Select a position</option>');
  });

  it("has no kicker pill on the register page", () => {
    const page = readFileSync("src/app/register/page.tsx", "utf8");
    expect(page).not.toContain("athlemetry-kicker");
  });
});

describe("registerSchema with unchecked consents", () => {
  it("accepts explicit false for both and keeps them false", () => {
    const result = registerSchema.safeParse({ ...athlete, shareInBenchmarks: false, anonymizeForBenchmark: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shareInBenchmarks).toBe(false);
      expect(result.data.anonymizeForBenchmark).toBe(false);
    }
  });

  it("still requires an age and a position for athletes", () => {
    expect(registerSchema.safeParse({ ...athlete, age: undefined }).success).toBe(false);
    expect(registerSchema.safeParse({ ...athlete, position: "" }).success).toBe(false);
  });
});
