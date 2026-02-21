import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = await request.json();
  if (payload?.role === "ADMIN") {
    return NextResponse.json({ error: "Admin accounts are owner-managed only." }, { status: 403 });
  }

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
  const isAthlete = data.role === "ATHLETE";
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
      age: isAthlete ? (data.age ?? null) : null,
      position: isAthlete ? (data.position ?? null) : null,
      team: isAthlete ? (data.team || null) : null,
      competitionLevel: isAthlete ? (data.competitionLevel ?? null) : null,
      gender: data.gender || null,
      parentEmail: isAthlete ? (data.parentEmail || null) : null,
      parentConsentVerified: isAthlete ? data.age !== undefined && data.age >= 18 : true,
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

  if (isAthlete && data.age !== undefined && data.age < 18) {
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
