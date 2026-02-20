import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = registerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid registration payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });

  if (existing && !existing.deletedAt) {
    return NextResponse.json({ error: "Account already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role as Role,
      name: data.name,
      age: data.age,
      position: data.position,
      team: data.team || null,
      competitionLevel: data.competitionLevel,
      gender: data.gender || null,
      parentEmail: data.parentEmail || null,
      parentConsentVerified: data.age >= 18,
      shareInBenchmarks: data.shareInBenchmarks,
      anonymizeForBenchmark: data.anonymizeForBenchmark,
    },
    select: {
      id: true,
      email: true,
      role: true,
      parentConsentVerified: true,
    },
  });

  await prisma.consentLog.create({
    data: {
      userId: user.id,
      consentType: "ACCOUNT_REGISTRATION",
      granted: true,
      notes: `Initial registration via role=${user.role}`,
    },
  });

  if (data.age < 18) {
    await prisma.consentLog.create({
      data: {
        userId: user.id,
        consentType: "PARENTAL_APPROVAL_REQUIRED",
        granted: false,
        notes: `Awaiting approval from ${data.parentEmail}`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    user,
  });
}
