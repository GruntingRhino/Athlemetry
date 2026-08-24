import { randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

export const REFERRAL_CODE_LENGTH = 16;

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{8,24}$/.test(normalized) ? normalized : undefined;
}

export function generateReferralCode() {
  return randomBytes(REFERRAL_CODE_LENGTH / 2).toString("hex").toUpperCase();
}

function isUniqueConstraintViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getOrCreateReferralCode(
  userId: string,
  client: Pick<PrismaClient, "user">,
) {
  const existing = await client.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!existing) return null;
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const referralCode = generateReferralCode();
    try {
      const updated = await client.user.update({
        where: { id: userId },
        data: { referralCode },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch (error) {
      if (!isUniqueConstraintViolation(error) || attempt === 2) throw error;
    }
  }

  return null;
}

export async function getReferralAttributionSummary(
  userId: string,
  client: Pick<PrismaClient, "user">,
  now = new Date(),
) {
  const [attributedRegistrationCount, currentPaidReferralCount] = await Promise.all([
    client.user.count({
      where: { referredByUserId: userId, deletedAt: null },
    }),
    client.user.count({
      where: {
        referredByUserId: userId,
        deletedAt: null,
        OR: [
          {
            billingAccount: {
              is: {
                subscription: {
                  is: {
                    status: { in: ["active", "trialing"] },
                    currentPeriodEnd: { gt: now },
                  },
                },
              },
            },
          },
          {
            billingAccount: {
              is: {
                subscription: {
                  is: {
                    status: "past_due",
                    graceUntil: { gt: now },
                  },
                },
              },
            },
          },
        ],
      },
    }),
  ]);

  return { attributedRegistrationCount, currentPaidReferralCount };
}
