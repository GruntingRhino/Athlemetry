import { describe, expect, it } from "vitest";

import { STANDARD_DRILLS } from "@/lib/constants";
import { formatCustomerMetricDelta, formatCustomerMetricValue, getMetricPresentation } from "@/lib/metric-presentation";

describe("customer metric presentation", () => {
  it("provides a measurement definition and unit for released protocol metrics", () => {
    expect(getMetricPresentation("sprintTime")).toEqual({
      label: "Sprint time",
      unit: "seconds",
      definition: "Elapsed time from the verified start marker to the verified finish marker.",
      measurementType: "Timed measurement",
      method: "Timed from the protocol-defined start and finish markers in a verified capture.",
      interpretation: "Lower elapsed time indicates a faster completed sprint over the verified course.",
      limitations: "This result applies only to the recorded course and capture; it does not diagnose health, technique, or broader athletic ability.",
    });
  });

  it("provides a measurement type, method, interpretation, and limitation for every reportable primary metric", () => {
    for (const drill of STANDARD_DRILLS) {
      const presentation = getMetricPresentation(drill.metricPrimaryKey);
      expect(presentation, `${drill.slug} should have a customer presentation`).not.toBeNull();
      expect(presentation?.measurementType.length).toBeGreaterThan(0);
      expect(presentation?.method.length).toBeGreaterThan(0);
      expect(presentation?.interpretation.length).toBeGreaterThan(0);
      expect(presentation?.limitations.length).toBeGreaterThan(0);
    }
  });

  it("does not present internal reliability fields as customer measurements", () => {
    expect(getMetricPresentation("reliabilityScore")).toBeNull();
  });

  it("formats count metrics without a misleading decimal", () => {
    expect(formatCustomerMetricValue(12, "count")).toBe("12");
    expect(formatCustomerMetricValue(3.125, "seconds")).toBe("3.13 seconds");
  });

  it("describes report deltas as numerical changes without a performance claim", () => {
    expect(formatCustomerMetricDelta(-0.2, "seconds")).toBe("0.20 seconds lower");
    expect(formatCustomerMetricDelta(2, "count")).toBe("2 higher");
    expect(formatCustomerMetricDelta(0, "seconds")).toBe("No numerical change");
  });
});
