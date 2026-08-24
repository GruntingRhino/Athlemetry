import { NextResponse } from "next/server";

import { getActiveMetricModelVersion, isMetricReleased } from "@/lib/customer-metrics";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const activeModelVersion = await getActiveMetricModelVersion();
  const drills = await prisma.drillDefinition.findMany({
    where: { isActive: true },
    include: { metricValidations: true },
    orderBy: { name: "asc" },
  });

  const publicDrills = drills.map((drill) => {
    const protocol = DRILL_PROTOCOLS[drill.slug as keyof typeof DRILL_PROTOCOLS] ?? null;
    const metricRelease = Object.fromEntries(
      (protocol?.metrics ?? []).map((metric) => {
        const validation = drill.metricValidations.find((item) => item.metricName === metric.key && item.modelVersion === activeModelVersion);
        return [metric.key, {
          released: isMetricReleased(drill.slug, metric.key, activeModelVersion, validation),
          sampleSize: validation?.sampleSize ?? 0,
          protocolVersion: protocol?.version ?? null,
          modelVersion: activeModelVersion,
          independentlyReviewedAt: validation?.independentlyReviewedAt ?? null,
        }];
      }),
    );
    const definition = Object.fromEntries(
      Object.entries(drill).filter(([key]) => key !== "metricValidations"),
    );
    return { ...definition, protocol, metricRelease };
  });

  return NextResponse.json({
    data: publicDrills,
    meta: {
      count: publicDrills.length,
      version: "v1",
    },
  });
}
