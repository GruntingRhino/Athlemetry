import { describe, expect, it } from "vitest";

import { STANDARD_DRILLS } from "@/lib/constants";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

describe("basketball spot-shooting workflow", () => {
  it("requires a basketball-scoped catalog, protocol, and fixed court capture", () => {
    expect(STANDARD_DRILLS.find((drill) => drill.slug === "basketball-spot-shooting")).toMatchObject({
      sport: "basketball",
      metricPrimaryKey: "accuracyScore",
    });
    expect(DRILL_PROTOCOLS["basketball-spot-shooting" as keyof typeof DRILL_PROTOCOLS]).toMatchObject({ sport: "basketball" });
    expect(getDrillCaptureProfile({ slug: "basketball-spot-shooting", sport: "basketball" })).toMatchObject({
      cameraAngle: "diagonal",
      measurementDistanceFeet: 15,
    });
  });
});
