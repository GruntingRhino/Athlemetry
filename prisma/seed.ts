import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const drillSeed = [
  {
    slug: "sprint-20m",
    name: "20-meter sprint",
    description: "Linear sprint across 20 meters.",
    guidelines:
      "Camera 90° side angle, full body in frame, fixed tripod, clear start/finish markers.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    metricPrimaryKey: "sprintTime",
    lowerIsBetter: true,
  },
  {
    slug: "agility-5-10-5",
    name: "5-10-5 agility drill",
    description: "Change-of-direction shuttle using 5m and 10m splits.",
    guidelines:
      "Wide angle showing all cones, synchronized start cue, visible line touches.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    metricPrimaryKey: "changeOfDirectionMeasurement",
    lowerIsBetter: true,
  },
  {
    slug: "shooting-accuracy",
    name: "Shooting accuracy drill",
    description: "Timed shot cycle and target-hit tracking.",
    guidelines:
      "Behind-goal camera, visible target zones, fixed distance to goal.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    metricPrimaryKey: "shotTiming",
    lowerIsBetter: true,
  },
  {
    slug: "cone-dribble",
    name: "Cone dribble drill",
    description: "Dribble through fixed cone layout and return.",
    guidelines:
      "Top-side view preferred, consistent cone spacing, full path visible.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "shuttle-endurance",
    name: "Shuttle endurance test",
    description: "Multi-repetition shuttle workload test.",
    guidelines:
      "Field-length framing, clear rep markers, uninterrupted recording.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    metricPrimaryKey: "repetitionCount",
    lowerIsBetter: false,
  },
];

const positions = [
  { code: "GK", label: "Goalkeeper" },
  { code: "DEF", label: "Defender" },
  { code: "MID", label: "Midfielder" },
  { code: "FWD", label: "Forward" },
  { code: "UTIL", label: "Utility" },
];

async function main() {
  const adminPassword = await bcrypt.hash("admin1234", 12);

  await prisma.user.upsert({
    where: { email: "admin@athlemetry.dev" },
    update: {},
    create: {
      email: "admin@athlemetry.dev",
      passwordHash: adminPassword,
      name: "System Admin",
      role: Role.ADMIN,
      parentConsentVerified: true,
      competitionLevel: "academy",
      position: "UTIL",
      age: 30,
    },
  });

  for (const drill of drillSeed) {
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
    where: { version: "v1.0.0" },
    update: { isActive: true, notes: "Initial deterministic rule-based extractor." },
    create: {
      version: "v1.0.0",
      notes: "Initial deterministic rule-based extractor.",
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
