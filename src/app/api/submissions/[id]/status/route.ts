import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Processing status only, for the live clip tracker. Read-only, so no audit
 * entry; scoped to the owner (or an admin) and answers 404 for anyone else's
 * submission without saying whether it exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  try {
    const submission = await prisma.drillSubmission.findFirst({
      where: session.user.role === "ADMIN" ? { id } : { id, athleteId: session.user.id },
      select: { processingStatus: true },
    });
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    return NextResponse.json(
      { processingStatus: submission.processingStatus },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Status is temporarily unavailable." }, { status: 503 });
  }
}
