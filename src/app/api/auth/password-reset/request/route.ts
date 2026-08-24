import { NextResponse } from "next/server";

import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import {
  getPasswordResetDeliveryConfig,
  passwordResetIdentifier,
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { passwordResetRequestSchema } from "@/lib/validators";
import {
  createVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry,
} from "@/lib/verification-tokens";

const WINDOW_MS = 15 * 60_000;
const GENERIC_RESPONSE = { ok: true };

function resetUrl(token: string) {
  const baseUrl = process.env.NEXTAUTH_URL?.trim();
  if (!baseUrl) return null;

  try {
    const url = new URL("/reset-password", baseUrl);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  const delivery = getPasswordResetDeliveryConfig();
  const linkBase = resetUrl("placeholder");
  if (!delivery || !linkBase) {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const sourceLimit = await checkDatabaseRateLimit({
      namespace: "password-reset-source",
      identifier: rateLimitSource(request.headers),
      windowMs: WINDOW_MS,
      maxRequests: 10,
    });
    if (!sourceLimit.allowed) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
    }
    const accountLimit = await checkDatabaseRateLimit({
      namespace: "password-reset-account",
      identifier: email,
      windowMs: WINDOW_MS,
      maxRequests: 3,
    });
    if (!accountLimit.allowed) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
    }
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
  }

  const identifier = passwordResetIdentifier(user.email);
  const token = createVerificationToken();
  const hashedToken = hashVerificationToken(token);
  const expires = verificationTokenExpiry();
  const url = resetUrl(token);
  if (!url) {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.verificationToken.deleteMany({ where: { identifier } });
    await transaction.verificationToken.create({
      data: { identifier, token: hashedToken, expires },
    });
  });

  try {
    const response = await fetch(delivery.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${delivery.bearerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "password_reset",
        to: user.email,
        resetUrl: url,
        expiresAt: expires.toISOString(),
      }),
    });
    if (!response.ok) throw new Error("Password reset delivery rejected.");
  } catch {
    await prisma.verificationToken.deleteMany({ where: { identifier, token: hashedToken } });
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
}
