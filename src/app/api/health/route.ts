import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    // Never surface the driver error: it can embed the connection string.
    console.error("Health check failed: database unreachable.");
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({
    status: "ok",
    latencyMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  });
}
