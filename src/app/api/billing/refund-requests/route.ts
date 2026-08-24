import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { refundRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = refundRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid refund request." }, { status: 400 });

  try {
    const limit = await checkDatabaseRateLimit({
      namespace: "refund-request",
      identifier: `${session.user.id}:${rateLimitSource(request.headers)}`,
      windowMs: 24 * 60 * 60_000,
      maxRequests: 3,
    });
    if (!limit.allowed) return NextResponse.json({ error: "Too many refund requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

    const account = await prisma.billingAccount.findUnique({ where: { userId: session.user.id }, select: { id: true } });
    if (!account) return NextResponse.json({ error: "Billing account not found." }, { status: 404 });
    const existing = await prisma.refundRequest.findFirst({ where: { billingAccountId: account.id, status: { in: ["OPEN", "IN_REVIEW"] } }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "A refund request is already under review." }, { status: 409 });

    const refundRequest = await prisma.$transaction(async (transaction) => {
      const created = await transaction.refundRequest.create({ data: { billingAccountId: account.id, requesterId: session.user.id, ...parsed.data } });
      await transaction.systemLog.create({ data: { level: "INFO", category: "SECURITY_AUDIT", message: "Refund request filed", metadata: { action: "REFUND_REQUEST_FILED", actorUserId: session.user.id, refundRequestId: created.id } } });
      return created;
    });
    return NextResponse.json({ ok: true, refundRequest }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Refund request could not be recorded safely." }, { status: 503 });
  }
}
