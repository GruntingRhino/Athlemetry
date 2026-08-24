import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  checkDatabaseRateLimit,
  getDatabaseRateLimitStatus,
  rateLimitSource,
  resetDatabaseRateLimit,
} from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validators";

const DUMMY_PASSWORD_HASH = "$2b$12$usH8ebLU.TIO/Ip6eFdXauTw.1xfv9mNWRgfAgaDq5a.lKxAy5Uau";
const FAILURE_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password change request." }, { status: 400 });
  }

  let sourceLimit;
  try {
    sourceLimit = await checkDatabaseRateLimit({
      namespace: "password-change-source",
      identifier: rateLimitSource(request.headers),
      windowMs: FAILURE_WINDOW_MS,
      maxRequests: 20,
    });
  } catch {
    return NextResponse.json(
      { error: "Password change protection is temporarily unavailable." },
      { status: 503 },
    );
  }
  if (!sourceLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(sourceLimit.retryAfterSeconds) } },
    );
  }

  let accountLimit;
  try {
    accountLimit = await getDatabaseRateLimitStatus({
      namespace: "password-change-account-failure",
      identifier: userId,
      windowMs: FAILURE_WINDOW_MS,
      maxRequests: 5,
    });
  } catch {
    return NextResponse.json(
      { error: "Password change protection is temporarily unavailable." },
      { status: 503 },
    );
  }
  if (accountLimit.blocked) {
    await bcrypt.compare(parsed.data.currentPassword, DUMMY_PASSWORD_HASH);
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, deletedAt: true },
  });
  const passwordHash = user && !user.deletedAt ? user.passwordHash : DUMMY_PASSWORD_HASH;
  const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, passwordHash);

  if (!user || user.deletedAt || !currentPasswordMatches) {
    try {
      await checkDatabaseRateLimit({
        namespace: "password-change-account-failure",
        identifier: userId,
        windowMs: FAILURE_WINDOW_MS,
        maxRequests: 5,
      });
    } catch {
      return NextResponse.json(
        { error: "Password change protection is temporarily unavailable." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const changed = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash, deletedAt: null },
      data: { passwordHash: newPasswordHash },
    });
    if (updated.count !== 1) return false;

    await transaction.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Password changed",
        metadata: { action: "PASSWORD_CHANGED", actorUserId: userId },
      },
    });
    return true;
  });
  if (!changed) {
    return NextResponse.json(
      { error: "Password could not be changed. Please sign in again." },
      { status: 409 },
    );
  }

  try {
    await resetDatabaseRateLimit({
      namespace: "password-change-account-failure",
      identifier: userId,
    });
  } catch {
    // The password update already committed. Retaining old failures is safe.
  }

  return NextResponse.json({ ok: true });
}
