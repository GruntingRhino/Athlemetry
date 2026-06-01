import { prisma } from "@/lib/prisma";
import {
  SPORT_DESCRIPTIONS,
  SPORT_LABELS,
  SPORT_OPTIONS,
  STANDARD_DRILLS,
  type SportOption,
} from "@/lib/constants";

export type StandardDrill = (typeof STANDARD_DRILLS)[number];
export type DrillLike = {
  id?: string;
  slug: string;
  name: string;
  sport: string;
  description: string;
  guidelines: string;
  instructionVideoUrl: string | null;
  metricPrimaryKey: string;
  lowerIsBetter: boolean;
};

export const DRILL_GUIDANCE: Record<string, { frameStartLabel: string; frameFinishLabel: string; helper: string }> = {
  "sprint-20m": {
    frameStartLabel: "Start frame",
    frameFinishLabel: "Finish frame",
    helper: "Keep the full sprint lane visible and use the 20m default unless your field setup differs.",
  },
  "agility-5-10-5": {
    frameStartLabel: "Start frame",
    frameFinishLabel: "Finish frame",
    helper: "Mark the first movement and the final cone touch or finish cross.",
  },
  "shooting-accuracy": {
    frameStartLabel: "Plant frame",
    frameFinishLabel: "Strike frame",
    helper: "Mark the plant step or backswing start and the instant of ball strike.",
  },
  "cone-dribble": {
    frameStartLabel: "Start frame",
    frameFinishLabel: "Finish frame",
    helper: "Use the first touch/start motion and the frame where the athlete clears the last cone/finish marker.",
  },
  "shuttle-endurance": {
    frameStartLabel: "Start frame",
    frameFinishLabel: "Finish frame",
    helper: "Capture the first movement and the end of the final rep you want measured.",
  },
  "baseball-pitch-velocity": {
    frameStartLabel: "Release frame",
    frameFinishLabel: "Catch / plate frame",
    helper: "For best accuracy, mark release and the moment the catcher receives the ball or the ball crosses the plate. Use the 60.5 ft default unless the setup differs.",
  },
  "baseball-pitch-command": {
    frameStartLabel: "Release frame",
    frameFinishLabel: "Target / catch frame",
    helper: "Track one representative pitch travel window and use repetition hint for total command-set attempts.",
  },
  "baseball-swing-timing": {
    frameStartLabel: "Load start frame",
    frameFinishLabel: "Contact frame",
    helper: "Mark the start of the committed load/move and the exact contact frame. If contact is not visible, expect an unclear-video note.",
  },
  "basketball-form-capture": {
    frameStartLabel: "Shot gather frame",
    frameFinishLabel: "Release frame",
    helper: "Mark visible free-throw or three-point markings and use the distance slider if the court is nonstandard.",
  },
};

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function ensureStandardDrills() {
  if (!hasDatabaseUrl()) {
    return false;
  }

  await Promise.all(
    STANDARD_DRILLS.map((drill) =>
      prisma.drillDefinition.upsert({
        where: { slug: drill.slug },
        update: drill,
        create: drill,
      }),
    ),
  );

  return true;
}

export async function getAvailableDrills(): Promise<DrillLike[]> {
  if (!hasDatabaseUrl()) {
    return STANDARD_DRILLS.map((drill) => ({ ...drill, id: drill.slug }));
  }

  await ensureStandardDrills();
  const drills = await prisma.drillDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ sport: "asc" }, { name: "asc" }],
  });

  return drills.map((drill) => ({
    id: drill.id,
    slug: drill.slug,
    name: drill.name,
    sport: drill.sport,
    description: drill.description,
    guidelines: drill.guidelines,
    instructionVideoUrl: drill.instructionVideoUrl,
    metricPrimaryKey: drill.metricPrimaryKey,
    lowerIsBetter: drill.lowerIsBetter,
  }));
}

export function groupDrillsBySport<T extends { sport: string }>(drills: T[]) {
  return SPORT_OPTIONS.map((sport) => ({
    sport,
    label: SPORT_LABELS[sport],
    description: SPORT_DESCRIPTIONS[sport],
    drills: drills.filter((drill) => drill.sport === sport),
  }));
}

export function normalizeSport(value: string | null | undefined): SportOption {
  if (value && SPORT_OPTIONS.includes(value as SportOption)) {
    return value as SportOption;
  }

  return "soccer";
}

export function getDrillGuidance(slug: string) {
  return DRILL_GUIDANCE[slug] ?? {
    frameStartLabel: "Start frame",
    frameFinishLabel: "Finish frame",
    helper: "Mark the exact start and finish/contact frames you want the analysis to use.",
  };
}
