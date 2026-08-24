import { describe, expect, it } from "vitest";

import { STANDARD_DRILLS } from "@/lib/constants";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

describe("basketball free-throw workflow", () => {
  it("provides a sport-scoped catalog, protocol, and fixed capture guidance", () => {
    const drill = STANDARD_DRILLS.find((candidate) => candidate.slug === "basketball-free-throw");
    expect(drill).toMatchObject({ sport: "basketball", metricPrimaryKey: "accuracyScore" });
    expect(DRILL_PROTOCOLS["basketball-free-throw" as keyof typeof DRILL_PROTOCOLS]).toMatchObject({ sport: "basketball" });
    expect(getDrillCaptureProfile({ slug: "basketball-free-throw", sport: "basketball" })).toMatchObject({
      cameraAngle: "diagonal",
      measurementDistanceFeet: 15,
    });
  });
});
