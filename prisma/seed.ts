import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import "dotenv/config";

import { STANDARD_DRILLS } from "../src/lib/constants";
import { resolveSeedAdmin } from "./seed-config";

const prisma = new PrismaClient();

const positions = [
  { code: "GK", label: "Goalkeeper" },
  { code: "DEF", label: "Defender" },
  { code: "MID", label: "Midfielder" },
  { code: "FWD", label: "Forward" },
  { code: "UTIL", label: "Utility" },
];

async function main() {
  const seedAdmin = resolveSeedAdmin(process.env);
  if (seedAdmin) {
    const adminPassword = await bcrypt.hash(seedAdmin.password, 12);
    await prisma.user.upsert({
      where: { email: seedAdmin.email },
      update: {},
      create: {
        email: seedAdmin.email,
        passwordHash: adminPassword,
        name: "System Admin",
        role: Role.ADMIN,
        parentConsentVerified: true,
      },
    });
  }

  for (const drill of STANDARD_DRILLS) {
    await prisma.drillDefinition.upsert({
      where: { slug: drill.slug },
      update: drill,
      create: drill,
    });
  }

  for (const position of positions) {
    await prisma.positionTaxonomy.upsert({
      where: { code: position.code },
      update: position,
      create: position,
    });
  }

  await prisma.modelVersion.upsert({
    where: { version: "v1.1.0" },
    update: { isActive: true, notes: "Expanded sport-aware deterministic extractor with conservative baseball notes." },
    create: {
      version: "v1.1.0",
      notes: "Expanded sport-aware deterministic extractor with conservative baseball notes.",
      isActive: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
