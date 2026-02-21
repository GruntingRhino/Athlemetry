import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        deletedAt: new Date(),
        email: `${session.user.id}+deleted@athlemetry.local`,
        passwordHash: "deleted",
        name: "Deleted User",
      },
    }),
    prisma.session.deleteMany({
      where: { userId: session.user.id },
    }),
    prisma.consentLog.create({
      data: {
        userId: session.user.id,
        actorUserId: session.user.id,
        consentType: "ACCOUNT_DELETION",
        granted: true,
        notes: "User-initiated deletion request.",
      },
    }),
  ]);

  const response = NextResponse.json({ ok: true });
  for (const cookieName of [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ]) {
    response.cookies.set({
      name: cookieName,
      value: "",
      expires: new Date(0),
      path: "/",
    });
  }

  return response;
}
