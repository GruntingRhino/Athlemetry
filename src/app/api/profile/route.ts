import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
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
    select: { shareInBenchmarks: true, anonymizeForBenchmark: true },
  });

  if (!current) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      age: parsed.data.age,
      position: parsed.data.position,
      team: parsed.data.team || null,
      competitionLevel: parsed.data.competitionLevel,
      gender: parsed.data.gender || null,
      shareInBenchmarks: parsed.data.shareInBenchmarks,
      anonymizeForBenchmark: parsed.data.anonymizeForBenchmark,
    },
  });

  if (
    current.shareInBenchmarks !== parsed.data.shareInBenchmarks ||
    current.anonymizeForBenchmark !== parsed.data.anonymizeForBenchmark
  ) {
    await prisma.consentLog.create({
      data: {
        userId: session.user.id,
        actorUserId: session.user.id,
        consentType: "PRIVACY_CONTROL_UPDATE",
        granted: parsed.data.shareInBenchmarks,
        notes: `shareInBenchmarks=${parsed.data.shareInBenchmarks}; anonymize=${parsed.data.anonymizeForBenchmark}`,
      },
    });
  }

  return NextResponse.json({ ok: true, user: updated });
}
