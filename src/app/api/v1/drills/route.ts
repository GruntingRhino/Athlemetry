import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const drills = await prisma.drillDefinition.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: drills,
    meta: {
      count: drills.length,
      version: "v1",
    },
  });
}
