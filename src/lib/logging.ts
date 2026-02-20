import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function writeSystemLog(params: {
  level: "INFO" | "WARN" | "ERROR";
  category: string;
  message: string;
  metadata?: Prisma.InputJsonObject;
  latencyMs?: number;
}) {
  await prisma.systemLog.create({
    data: {
      level: params.level,
      category: params.category,
      message: params.message,
      metadata: params.metadata,
      latencyMs: params.latencyMs,
    },
  });
}
