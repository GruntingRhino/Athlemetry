import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  isCoachingActionIndexValid,
  isCoachingPlanEvidenceCurrent,
} from "@/lib/coaching-plans";
import { prisma } from "@/lib/prisma";
import { coachingPlanActionCompletionSchema } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = coachingPlanActionCompletionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid training-action completion request." }, { status: 400 });

  const { id } = await context.params;
  const plan = await prisma.coachingPlan.findFirst({
    where: { id, athleteId: session.user.id, status: "ACTIVE" },
    include: {
      drillDefinition: true,
      sourceSubmission: { include: { metricResult: true } },
    },
  });
  if (!plan) return NextResponse.json({ error: "Coaching plan not found." }, { status: 404 });

  const primaryMetricName = plan.drillDefinition.metricPrimaryKey;
  const primaryMetricValue = plan.sourceSubmission.metricResult?.[
    primaryMetricName as keyof NonNullable<typeof plan.sourceSubmission.metricResult>
  ];
  const evidenceCurrent = await isCoachingPlanEvidenceCurrent({
    drillDefinitionId: plan.drillDefinitionId,
    drillSlug: plan.drillDefinition.slug,
    primaryMetricName,
    primaryMetricValue,
    metricVersion: plan.sourceSubmission.metricResult?.metricVersion ?? "unavailable",
    metadata: plan.sourceSubmission.metadata,
  });
  if (!evidenceCurrent || !isCoachingActionIndexValid(plan.recommendations, parsed.data.actionIndex)) {
    return NextResponse.json({ error: "Coaching plan not found." }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      if (parsed.data.completed) {
        await transaction.coachingPlanActionCompletion.upsert({
          where: { coachingPlanId_actionIndex: { coachingPlanId: plan.id, actionIndex: parsed.data.actionIndex } },
          update: { completedAt: new Date() },
          create: { coachingPlanId: plan.id, actionIndex: parsed.data.actionIndex },
        });
      } else {
        await transaction.coachingPlanActionCompletion.deleteMany({
          where: { coachingPlanId: plan.id, actionIndex: parsed.data.actionIndex },
        });
      }
      await transaction.coachingPlanActionEvent.create({
        data: {
          coachingPlanId: plan.id,
          actionIndex: parsed.data.actionIndex,
          actorUserId: session.user.id,
          completed: parsed.data.completed,
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Training-action completion could not be updated safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, completed: parsed.data.completed });
}
