import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referrals";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  let rateLimitResult;
  try {
    const ip = rateLimitSource(request.headers);
    rateLimitResult = await checkDatabaseRateLimit({
      namespace: "register",
      identifier: ip,
      windowMs: 60_000,
      maxRequests: 10,
    });
  } catch {
    return NextResponse.json({ error: "Registration protection is temporarily unavailable." }, { status: 503 });
  }
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
      },
    );
  }

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

  const referralCode = data.referralCode ? normalizeReferralCode(data.referralCode) : undefined;
  if (data.referralCode && !referralCode) {
    return NextResponse.json({ error: "Invalid referral code." }, { status: 400 });
  }
  const referringUser = referralCode
    ? await prisma.user.findFirst({
      where: { referralCode, deletedAt: null },
      select: { id: true },
    })
    : null;
  if (referralCode && !referringUser) {
    return NextResponse.json({ error: "Invalid referral code." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  let user;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          role: data.role as Role,
          name: data.name,
          age: isAthlete ? (data.age ?? null) : null,
          primarySport: isAthlete ? (data.primarySport ?? null) : null,
          performanceGoal: isAthlete ? (data.performanceGoal ?? null) : null,
          position: isAthlete ? (data.position ?? null) : null,
          team: isAthlete ? (data.team || null) : null,
          competitionLevel: isAthlete ? (data.competitionLevel ?? null) : null,
          gender: data.gender || null,
          parentEmail: isAthlete ? (data.parentEmail || null) : null,
          parentConsentVerified: isAthlete ? data.age !== undefined && data.age >= 18 : true,
          shareInBenchmarks: data.shareInBenchmarks,
          anonymizeForBenchmark: data.anonymizeForBenchmark,
          referralCode: generateReferralCode(),
          referredByUserId: referringUser?.id,
        },
        select: {
          id: true,
          email: true,
          role: true,
          parentConsentVerified: true,
        },
      });

      await tx.consentLog.create({
        data: {
          userId: created.id,
          consentType: "ACCOUNT_REGISTRATION",
          granted: true,
          notes: `Initial registration via role=${created.role}`,
        },
      });
      await tx.consentLog.create({
        data: {
          userId: created.id,
          consentType: "PRIVACY_CONTROL_UPDATE",
          granted: data.shareInBenchmarks,
          notes: `shareInBenchmarks=${data.shareInBenchmarks}; anonymize=${data.anonymizeForBenchmark}`,
        },
      });

      if (isAthlete && data.age !== undefined && data.age < 18) {
        await tx.consentLog.create({
          data: {
            userId: created.id,
            consentType: "PARENTAL_APPROVAL_REQUIRED",
            granted: false,
            notes: "Awaiting approval from the linked parent account.",
          },
        });
      }
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Account registered",
          metadata: { action: "ACCOUNT_REGISTERED", actorUserId: created.id },
        },
      });
      return created;
      });
      break;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || attempt === 2) {
        return NextResponse.json({ error: "Registration could not be completed." }, { status: 503 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    user,
  });
}
