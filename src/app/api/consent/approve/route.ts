import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consentApprovalSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "PARENT" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = consentApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid consent approval payload.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const payload = parsed.data;

  const athlete = await prisma.user.findUnique({
    where: { email: payload.athleteEmail.toLowerCase() },
  });

  if (!athlete) {
    return NextResponse.json({ error: "Athlete not found." }, { status: 404 });
  }
  if (athlete.role !== "ATHLETE" || athlete.age === null || athlete.age >= 18) {
    return NextResponse.json(
      { error: "Parental approval applies only to registered minor athletes." },
      { status: 409 },
    );
  }

  if (
    session.user.role === "PARENT"
    && (!session.user.email || athlete.parentEmail?.toLowerCase() !== session.user.email.toLowerCase())
  ) {
    return NextResponse.json({ error: "You are not the registered parent for this athlete." }, { status: 403 });
  }

  const granted = payload.granted;

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: athlete.id },
        data: {
          parentConsentVerified: granted,
        },
      });
      await transaction.consentLog.create({
        data: {
          userId: athlete.id,
          actorUserId: session.user.id,
          consentType: "PARENTAL_APPROVAL",
          granted,
          notes: "Approval recorded by the linked parent or an administrator.",
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Parental consent approval updated",
          metadata: {
            action: "PARENTAL_CONSENT_APPROVAL_UPDATED",
            actorUserId: session.user.id,
            athleteId: athlete.id,
            granted,
          },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Consent approval could not be recorded safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, athleteId: athlete.id, granted });
}
