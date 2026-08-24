import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import { passwordResetIdentifier } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/validators";
import { hashVerificationToken } from "@/lib/verification-tokens";

const WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  try {
    const limit = await checkDatabaseRateLimit({
      namespace: "password-reset-confirm-source",
      identifier: rateLimitSource(request.headers),
      windowMs: WINDOW_MS,
      maxRequests: 10,
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }

  const token = hashVerificationToken(parsed.data.token);
  const stored = await prisma.verificationToken.findUnique({ where: { token } });
  if (
    !stored
    || !stored.identifier.startsWith("password-reset:")
    || stored.expires.getTime() <= Date.now()
  ) {
    return NextResponse.json({ error: "Password reset link is invalid or expired." }, { status: 400 });
  }

  const email = stored.identifier.slice("password-reset:".length);
  if (!email || passwordResetIdentifier(email) !== stored.identifier) {
    return NextResponse.json({ error: "Password reset link is invalid or expired." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const changed = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { email, deletedAt: null },
      data: { passwordHash },
    });
    if (updated.count !== 1) return false;

    await transaction.session.deleteMany({ where: { user: { email } } });
    await transaction.verificationToken.deleteMany({ where: { identifier: stored.identifier } });
    await transaction.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Password reset completed",
        metadata: { action: "PASSWORD_RESET", targetEmail: email },
      },
    });
    return true;
  });

  if (!changed) {
    return NextResponse.json({ error: "Password reset link is invalid or expired." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
