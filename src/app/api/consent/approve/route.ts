import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "PARENT" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json()) as { athleteEmail?: string; granted?: boolean };
  if (!payload.athleteEmail) {
    return NextResponse.json({ error: "athleteEmail is required." }, { status: 400 });
  }

  const athlete = await prisma.user.findUnique({
    where: { email: payload.athleteEmail.toLowerCase() },
  });

  if (!athlete) {
    return NextResponse.json({ error: "Athlete not found." }, { status: 404 });
  }

  const granted = payload.granted ?? true;

  await prisma.user.update({
    where: { id: athlete.id },
    data: {
      parentConsentVerified: granted,
    },
  });

  await prisma.consentLog.create({
    data: {
      userId: athlete.id,
      actorUserId: session.user.id,
      consentType: "PARENTAL_APPROVAL",
      granted,
      notes: `Approved by ${session.user.email}`,
    },
  });

  return NextResponse.json({ ok: true, athleteId: athlete.id, granted });
}
