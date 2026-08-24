import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { enqueueBenchmarkRebuilds } from "@/lib/benchmark-rebuild";
import { buildCohortKey } from "@/lib/benchmarking";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = profileSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      age: true,
      primarySport: true,
      performanceGoal: true,
      position: true,
      competitionLevel: true,
      gender: true,
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
      submissions: {
        select: {
          drillType: true,
          drillDefinitionId: true,
          drillDefinition: { select: { metricPrimaryKey: true } },
        },
      },
    },
  });

  if (!current) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (current.age !== null && current.age < 18 && parsed.data.age !== current.age) {
    return NextResponse.json(
      { error: "Age changes for minor accounts require parent or administrator support." },
      { status: 403 },
    );
  }

  const privacyChanged =
    current.shareInBenchmarks !== parsed.data.shareInBenchmarks ||
    current.anonymizeForBenchmark !== parsed.data.anonymizeForBenchmark;
  const demographicsChanged = current.age !== parsed.data.age
    || current.position !== parsed.data.position
    || current.competitionLevel !== parsed.data.competitionLevel
    || (current.gender ?? "") !== parsed.data.gender;
  const cohortChanged = privacyChanged || demographicsChanged;
  const affectedCohortMap = new Map((current.submissions ?? []).map((submission) => {
    const cohortKey = buildCohortKey({
      drillType: submission.drillType,
      athlete: current,
    } as never);
    const value = {
      cohortKey,
      drillDefinitionId: submission.drillDefinitionId,
      metricName: submission.drillDefinition.metricPrimaryKey,
    };
    return [`${cohortKey}|${value.drillDefinitionId}|${value.metricName}`, value] as const;
  }));
  if (demographicsChanged && parsed.data.shareInBenchmarks) {
    for (const submission of current.submissions ?? []) {
      const cohortKey = buildCohortKey({
        drillType: submission.drillType,
        athlete: parsed.data,
      } as never);
      const value = {
        cohortKey,
        drillDefinitionId: submission.drillDefinitionId,
        metricName: submission.drillDefinition.metricPrimaryKey,
      };
      affectedCohortMap.set(`${cohortKey}|${value.drillDefinitionId}|${value.metricName}`, value);
    }
  }
  const affectedCohorts = Array.from(affectedCohortMap.values());

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: session.user.id },
        data: {
          name: parsed.data.name,
          age: parsed.data.age,
          primarySport: parsed.data.primarySport,
          performanceGoal: parsed.data.performanceGoal ?? null,
          position: parsed.data.position,
          team: parsed.data.team || null,
          competitionLevel: parsed.data.competitionLevel,
          gender: parsed.data.gender || null,
          shareInBenchmarks: parsed.data.shareInBenchmarks,
          anonymizeForBenchmark: parsed.data.anonymizeForBenchmark,
        },
      });

      if (cohortChanged && affectedCohorts.length) {
        await tx.benchmarkSnapshot.deleteMany({
          where: { cohortKey: { in: [...new Set(affectedCohorts.map((item) => item.cohortKey))] } },
        });
        await tx.benchmarkAggregate.deleteMany({ where: { OR: affectedCohorts } });
        await enqueueBenchmarkRebuilds(tx, affectedCohorts);
      }

      if (privacyChanged) {
        await tx.consentLog.create({
          data: {
            userId: session.user.id,
            actorUserId: session.user.id,
            consentType: "PRIVACY_CONTROL_UPDATE",
            granted: parsed.data.shareInBenchmarks,
            notes: `shareInBenchmarks=${parsed.data.shareInBenchmarks}; anonymize=${parsed.data.anonymizeForBenchmark}`,
          },
        });
      }

      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Profile updated",
          metadata: {
            action: "PROFILE_UPDATED",
            actorUserId: session.user.id,
          },
        },
      });
      return user;
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        age: updated.age,
        primarySport: updated.primarySport,
        performanceGoal: updated.performanceGoal,
        position: updated.position,
        team: updated.team,
        competitionLevel: updated.competitionLevel,
        gender: updated.gender,
        shareInBenchmarks: updated.shareInBenchmarks,
        anonymizeForBenchmark: updated.anonymizeForBenchmark,
      },
    });
  } catch {
    return NextResponse.json({ error: "Profile could not be updated safely." }, { status: 503 });
  }
}
