import { describe, expect, it } from "vitest";

import {
  getDefaultPositionForSport,
  getPositionOptionsForSport,
  isPositionValidForSport,
} from "@/lib/constants";
import { profileSchema, registerSchema } from "@/lib/validators";

const validProfile = {
  name: "Test Athlete",
  age: 20,
  primarySport: "soccer",
  position: "MID",
  team: "",
  competitionLevel: "academy",
  gender: "",
  shareInBenchmarks: true,
  anonymizeForBenchmark: true,
};

describe("sport-specific position taxonomy", () => {
  it("keeps the established soccer positions while using distinct baseball and basketball choices", () => {
    expect(getPositionOptionsForSport("soccer").map((option) => option.value)).toEqual([
      "GK",
      "DEF",
      "MID",
      "FWD",
      "UTIL",
    ]);
    expect(getPositionOptionsForSport("baseball").map((option) => option.value)).toContain("P");
    expect(getPositionOptionsForSport("baseball").map((option) => option.value)).not.toContain("MID");
    expect(getPositionOptionsForSport("basketball").map((option) => option.value)).toContain("PG");
    expect(getPositionOptionsForSport("basketball").map((option) => option.value)).not.toContain("MID");
    expect(getDefaultPositionForSport("baseball")).toBe("P");
    expect(getDefaultPositionForSport("basketball")).toBe("PG");
  });

  it("accepts only positions belonging to the selected sport", () => {
    expect(isPositionValidForSport("soccer", "MID")).toBe(true);
    expect(isPositionValidForSport("baseball", "P")).toBe(true);
    expect(isPositionValidForSport("basketball", "PG")).toBe(true);
    expect(isPositionValidForSport("baseball", "MID")).toBe(false);
    expect(isPositionValidForSport("basketball", "P")).toBe(false);
  });

  it("rejects incompatible sport-position combinations in registration and profile payloads", () => {
    expect(registerSchema.safeParse({
      ...validProfile,
      email: "athlete@example.test",
      password: "supersecurepassword",
      role: "ATHLETE",
      primarySport: "baseball",
      position: "MID",
    }).success).toBe(false);

    expect(profileSchema.safeParse({
      ...validProfile,
      primarySport: "basketball",
      position: "PG",
    }).success).toBe(true);

    const profileResult = profileSchema.safeParse({
      ...validProfile,
      primarySport: "basketball",
      position: "DEF",
    });
    expect(profileResult.success).toBe(false);
    if (!profileResult.success) {
      expect(profileResult.error.flatten().fieldErrors.position).toContain(
        "Position is not valid for the selected primary sport.",
      );
    }
  });
});
