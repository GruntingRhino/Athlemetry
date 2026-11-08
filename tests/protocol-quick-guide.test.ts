import { describe, expect, it } from "vitest";

import { getDrillName, SPORT_OPTIONS, STANDARD_DRILLS } from "@/lib/constants";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { buildQuickGuideRows } from "@/lib/protocol-quick-guide";

describe("getDrillName", () => {
  it("returns the canonical drill name, matching the drill library source", () => {
    expect(getDrillName("sprint-20m")).toBe("20-meter sprint");
  });

  it("has a canonical name for every protocol slug", () => {
    const known = new Set<string>(STANDARD_DRILLS.map((drill) => drill.slug));
    for (const slug of Object.keys(DRILL_PROTOCOLS)) {
      expect(known.has(slug), slug).toBe(true);
      expect(getDrillName(slug)).not.toBe(slug.replaceAll("-", " "));
    }
  });

  it("falls back to a readable slug for unknown drills", () => {
    expect(getDrillName("made-up-drill")).toBe("made up drill");
  });
});

describe("buildQuickGuideRows", () => {
  const rows = buildQuickGuideRows(Object.entries(DRILL_PROTOCOLS));

  it("derives one row per protocol straight from the protocol camera data", () => {
    expect(rows).toHaveLength(Object.keys(DRILL_PROTOCOLS).length);
    const sprint = rows.find((row) => row.slug === "sprint-20m");
    expect(sprint).toMatchObject({ sport: "soccer", view: "side or diagonal", minimumFps: 60, fullBodyRequired: true });
    for (const row of rows) {
      const camera = DRILL_PROTOCOLS[row.slug as keyof typeof DRILL_PROTOCOLS].camera;
      expect(row.minimumFps).toBe(camera.minimumFps);
      expect(row.referenceInFrame).toBe(camera.referenceInFrame);
    }
  });

  it("covers every launch sport and joins three views with an Oxford comma", () => {
    for (const sport of SPORT_OPTIONS) expect(rows.some((row) => row.sport === sport)).toBe(true);
    const three = buildQuickGuideRows([
      ["x", { sport: "soccer", camera: { acceptedAngles: ["side", "diagonal", "overhead"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "r" } }],
    ]);
    expect(three[0].view).toBe("side, diagonal, or overhead");
  });
});
