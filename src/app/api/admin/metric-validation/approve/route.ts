import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { enqueueBenchmarkRebuilds, findBenchmarkRebuildTargets } from "@/lib/benchmark-rebuild";
import { evaluateCapabilityRelease } from "@/lib/capability-validation";
import { evaluateMetricRelease } from "@/lib/drill-protocols";
import { isValidationEvidenceComplete } from "@/lib/customer-metrics";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !assertRole(session.user.role, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const validationId = typeof body.validationId === "string" ? body.validationId : "";
  const validation = await prisma.metricValidation.findUnique({
    where: { id: validationId },
    include: { drillDefinition: true },
  });
  if (!validation) return NextResponse.json({ error: "Validation record not found." }, { status: 404 });
  if (!validation.submittedByUserId || validation.submittedByUserId === session.user.id) {
    return NextResponse.json({ error: "A second administrator must approve validation evidence." }, { status: 409 });
  }
  if (validation.p90Error === null || validation.failureRate === null || validation.confidenceCalibrationError === null || validation.expertAgreement === null || !isValidationEvidenceComplete(validation)) {
    return NextResponse.json({ error: "Validation evidence is incomplete." }, { status: 422 });
  }
  const capabilityRelease = evaluateCapabilityRelease(validation.capabilityEvidence);
  if (!capabilityRelease.released) {
    return NextResponse.json({ error: "Professional capability thresholds were not met.", reasons: capabilityRelease.reasons }, { status: 422 });
  }

  const reviewedAt = new Date();
  const release = evaluateMetricRelease(validation.drillDefinition.slug, validation.metricName, {
    status: "VALIDATED",
    sampleSize: validation.sampleSize,
    p90Error: validation.p90Error,
    failureRate: validation.failureRate,
    confidenceCalibrationError: validation.confidenceCalibrationError,
    expertAgreement: validation.expertAgreement,
    independentlyReviewedAt: reviewedAt,
  });
  if (!release.released) {
    return NextResponse.json({ error: "Validation thresholds were not met.", reasons: release.reasons }, { status: 422 });
  }

  let approved;
  try {
    approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.metricValidation.update({
        where: { id: validation.id },
        data: {
          status: "VALIDATED",
          independentlyReviewedAt: reviewedAt,
          approvedByUserId: session.user.id,
        },
      });
      if (validation.metricName === validation.drillDefinition.metricPrimaryKey) {
        const targets = await findBenchmarkRebuildTargets(tx, validation.drillDefinitionId);
        await enqueueBenchmarkRebuilds(tx, targets);
      }
      if (
        validation.metricName === validation.drillDefinition.metricPrimaryKey
        || validation.metricName === "coachingRecommendations"
      ) {
        await tx.coachingPlan.updateMany({
          where: { drillDefinitionId: validation.drillDefinitionId, status: "WITHHELD" },
          data: { status: "ACTIVE" },
        });
      }
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Metric validation approved",
          metadata: {
            action: "METRIC_VALIDATION_APPROVED",
            actorUserId: session.user.id,
            validationId: validation.id,
          },
        },
      });
      return updated;
    });
  } catch {
    return NextResponse.json({ error: "Metric validation approval could not be recorded safely." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, validation: approved });
}
