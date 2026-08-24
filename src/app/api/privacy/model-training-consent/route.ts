import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { modelTrainingConsentSchema } from "@/lib/validators";

const MODEL_TRAINING_CONSENT_TYPE = "MODEL_TRAINING";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [current, history] = await Promise.all([
    prisma.consentLog.findFirst({
      where: { userId: session.user.id, consentType: MODEL_TRAINING_CONSENT_TYPE },
      orderBy: { createdAt: "desc" },
    }),
    prisma.consentLog.findMany({
      where: { userId: session.user.id, consentType: MODEL_TRAINING_CONSENT_TYPE },
      orderBy: { createdAt: "desc" },
      select: { granted: true, createdAt: true, actorUserId: true },
    }),
  ]);

  return NextResponse.json({ granted: current?.granted ?? false, history });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = modelTrainingConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid model-training consent request." }, { status: 400 });
  }

  const granted = parsed.data.granted;
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.consentLog.create({
        data: {
          userId: session.user.id,
          actorUserId: session.user.id,
          consentType: MODEL_TRAINING_CONSENT_TYPE,
          granted,
          notes: granted
            ? "Explicit account-owner opt-in for model-training use."
            : "Explicit account-owner withdrawal of model-training use.",
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Model-training consent changed",
          metadata: {
            action: granted ? "MODEL_TRAINING_CONSENT_GRANTED" : "MODEL_TRAINING_CONSENT_WITHDRAWN",
            actorUserId: session.user.id,
          },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Consent could not be recorded safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, granted });
}
