import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statuses = new Set(["OPEN", "IN_REVIEW", "APPROVED", "DECLINED", "COMPLETED"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.status !== "string" || !statuses.has(body.status)) return NextResponse.json({ error: "Invalid refund-review status." }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.refundRequest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Refund request not found." }, { status: 404 });
  const refundRequest = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.refundRequest.update({ where: { id }, data: { status: body.status } });
    await transaction.systemLog.create({ data: { level: "INFO", category: "SECURITY_AUDIT", message: "Refund request reviewed", metadata: { action: "REFUND_REQUEST_REVIEWED", actorUserId: session.user.id, refundRequestId: id, status: body.status } } });
    return updated;
  });
  return NextResponse.json({ ok: true, refundRequest });
}
