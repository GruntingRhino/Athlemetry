import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPETITION_LEVEL_LABELS,
  COMPETITION_LEVEL_OPTIONS,
  getMetricLabel,
  getPositionOptionsForSport,
  ROLE_LABELS,
  ROLE_OPTIONS,
  SPORT_OPTIONS,
  STANDARD_DRILLS,
} from "@/lib/constants";

describe("getMetricLabel", () => {
  it("never shows a raw identifier for any standard drill metric", () => {
    for (const drill of STANDARD_DRILLS) {
      const label = getMetricLabel(drill.metricPrimaryKey);
      expect(label).not.toBe(drill.metricPrimaryKey);
      expect(label).not.toMatch(/[a-z][A-Z]/);
      expect(label).toBe(label.charAt(0).toUpperCase() + label.slice(1));
    }
  });

  it("maps known keys to their human labels", () => {
    expect(getMetricLabel("sprintTime")).toBe("Sprint time");
    expect(getMetricLabel("changeOfDirectionMeasurement")).toBe("Change-of-direction time");
  });

  it("splits and capitalizes unknown camelCase keys", () => {
    expect(getMetricLabel("verticalJumpHeight")).toBe("Vertical jump height");
    expect(getMetricLabel("turnRate_v2")).toBe("Turn rate v2");
    expect(getMetricLabel("")).toBe("");
  });
});

describe("registration enum labels", () => {
  it("labels every role and competition level without changing the submitted values", () => {
    for (const role of ROLE_OPTIONS) expect(ROLE_LABELS[role]).toMatch(/^[A-Z][a-z]+$/);
    for (const level of COMPETITION_LEVEL_OPTIONS) {
      expect(COMPETITION_LEVEL_LABELS[level]).toBe(level.charAt(0).toUpperCase() + level.slice(1));
    }
  });

  it("renders labels but submits the raw values in the register form", () => {
    const source = readFileSync("src/components/forms/register-form.tsx", "utf8");
    expect(source).toContain("{ROLE_LABELS[roleOption]}");
    expect(source).toContain("{COMPETITION_LEVEL_LABELS[level]}");
    expect(source).toContain("value={roleOption}");
    expect(source).toContain("value={level}");
  });

  it("offers only positions that belong to the selected primary sport", () => {
    const soccer = getPositionOptionsForSport("soccer").map((option) => option.value);
    for (const sport of SPORT_OPTIONS.filter((candidate) => candidate !== "soccer")) {
      const own = getPositionOptionsForSport(sport).map((option) => option.value);
      expect(own).not.toContain("GK");
      expect(own).not.toEqual(soccer);
    }
    const source = readFileSync("src/components/forms/register-form.tsx", "utf8");
    expect(source).toContain("getPositionOptionsForSport(primarySport)");
  });

  it("keeps age and parent email collection for athletes", () => {
    const source = readFileSync("src/components/forms/register-form.tsx", "utf8");
    expect(source).toContain('name="age"');
    expect(source).toContain('name="parentEmail"');
    expect(source).toContain("requiresParentEmail ?");
  });
});
