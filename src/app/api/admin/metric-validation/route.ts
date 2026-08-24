import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { evaluateCapabilityRelease } from "@/lib/capability-validation";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { prisma } from "@/lib/prisma";

function finiteRate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !assertRole(session.user.role, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const drillDefinitionId = typeof body.drillDefinitionId === "string" ? body.drillDefinitionId : "";
  const metricName = typeof body.metricName === "string" ? body.metricName : "";
  const modelVersion = typeof body.modelVersion === "string" ? body.modelVersion.trim() : "";
  const sampleSize = typeof body.sampleSize === "number" && Number.isInteger(body.sampleSize) && body.sampleSize >= 0 ? body.sampleSize : null;
  const p90Error = typeof body.p90Error === "number" && Number.isFinite(body.p90Error) && body.p90Error >= 0 ? body.p90Error : null;
  const failureRate = finiteRate(body.failureRate);
  const confidenceCalibrationError = finiteRate(body.confidenceCalibrationError);
  const expertAgreement = finiteRate(body.expertAgreement);
  const evidenceUri = typeof body.evidenceUri === "string" && /^https:\/\//.test(body.evidenceUri) ? body.evidenceUri : null;
  const evidenceSha256 = typeof body.evidenceSha256 === "string" && /^[a-f0-9]{64}$/i.test(body.evidenceSha256.trim())
    ? body.evidenceSha256.trim().toLowerCase()
    : null;
  const reviewers = typeof body.reviewedBy === "string"
    ? body.reviewedBy.split(",").map((value: string) => value.trim()).filter(Boolean)
    : [];
  const capabilityRelease = evaluateCapabilityRelease(body.capabilityEvidence);
  if (!drillDefinitionId || !metricName || !modelVersion || sampleSize === null || p90Error === null || failureRate === null || confidenceCalibrationError === null || expertAgreement === null || !evidenceUri || !evidenceSha256 || new Set(reviewers).size < 2) {
    return NextResponse.json({ error: "A model version, complete numeric evidence, an HTTPS evidence URI with SHA-256 digest, and two distinct expert reviewers are required." }, { status: 400 });
  }
  if (!capabilityRelease.released) {
    return NextResponse.json({ error: "Professional capability evidence is incomplete.", reasons: capabilityRelease.reasons }, { status: 400 });
  }

  const drill = await prisma.drillDefinition.findUnique({ where: { id: drillDefinitionId } });
  const protocol = drill && DRILL_PROTOCOLS[drill.slug as keyof typeof DRILL_PROTOCOLS];
  if (!drill || !protocol || !protocol.metrics.some((metric) => metric.key === metricName)) {
    return NextResponse.json({ error: "Metric is not declared in the active drill protocol." }, { status: 400 });
  }

  const identity = { drillDefinitionId, metricName, protocolVersion: protocol.version, modelVersion };
  const existing = await prisma.metricValidation.findUnique({
    where: { drillDefinitionId_metricName_protocolVersion_modelVersion: identity },
  });
  try {
    const validation = await prisma.$transaction(async (tx) => {
      const updated = await tx.metricValidation.upsert({
        where: { drillDefinitionId_metricName_protocolVersion_modelVersion: identity },
        update: {
          status: "COLLECTING",
          sampleSize,
          p90Error,
          failureRate,
          confidenceCalibrationError,
          expertAgreement,
          evidenceUri,
          evidenceSha256,
          reviewedBy: [...new Set(reviewers)].join(", "),
          capabilityEvidence: body.capabilityEvidence,
          independentlyReviewedAt: null,
          submittedByUserId: session.user.id,
          approvedByUserId: null,
        },
        create: {
          ...identity,
          status: "COLLECTING",
          sampleSize,
          p90Error,
          failureRate,
          confidenceCalibrationError,
          expertAgreement,
          evidenceUri,
          evidenceSha256,
          reviewedBy: [...new Set(reviewers)].join(", "),
          capabilityEvidence: body.capabilityEvidence,
          submittedByUserId: session.user.id,
        },
      });
      if (existing?.status === "VALIDATED" && metricName === drill.metricPrimaryKey) {
        await tx.benchmarkSnapshot.deleteMany({
          where: { submission: { drillDefinitionId } },
        });
        await tx.benchmarkAggregate.deleteMany({ where: { drillDefinitionId, metricName } });
      }
      if (
        existing?.status === "VALIDATED"
        && (metricName === drill.metricPrimaryKey || metricName === "coachingRecommendations")
      ) {
        await tx.coachingPlan.updateMany({
          where: { drillDefinitionId, status: "ACTIVE" },
          data: { status: "WITHHELD" },
        });
      }
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Metric validation evidence submitted",
          metadata: {
            action: "METRIC_VALIDATION_SUBMITTED",
            actorUserId: session.user.id,
            validationId: updated.id,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ ok: true, validation });
  } catch {
    return NextResponse.json({ error: "Metric validation evidence could not be recorded safely." }, { status: 503 });
  }
}
