import { describe, expect, it } from "vitest";

import { STANDARD_DRILLS } from "@/lib/constants";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

describe("basketball lane-agility workflow", () => {
  it("requires a basketball-scoped catalog, measured lane protocol, and fixed capture profile", () => {
    expect(STANDARD_DRILLS.find((drill) => drill.slug === "basketball-lane-agility")).toMatchObject({
      sport: "basketball",
      metricPrimaryKey: "changeOfDirectionMeasurement",
    });
    expect(DRILL_PROTOCOLS["basketball-lane-agility" as keyof typeof DRILL_PROTOCOLS]).toMatchObject({ sport: "basketball" });
    expect(getDrillCaptureProfile({ slug: "basketball-lane-agility", sport: "basketball" })).toMatchObject({
      cameraAngle: "diagonal",
      measurementDistanceFeet: 47,
    });
  });
});
