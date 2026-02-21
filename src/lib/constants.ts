export const APP_NAME = "Athlemetry";

export const MAX_VIDEO_SIZE_MB = Number.parseInt(process.env.MAX_VIDEO_SIZE_MB ?? "200", 10);
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export const STANDARD_DRILLS = [
  {
    slug: "sprint-20m",
    name: "20-meter sprint",
    sport: "soccer",
    description: "Linear sprint across 20 meters.",
    guidelines:
      "Camera 90° side angle, full body in frame, fixed tripod, clear start/finish markers.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=20+meter+sprint+soccer+drill+instruction",
    metricPrimaryKey: "sprintTime",
    lowerIsBetter: true,
  },
  {
    slug: "agility-5-10-5",
    name: "5-10-5 agility drill",
    sport: "soccer",
    description: "Change-of-direction shuttle using 5m and 10m splits.",
    guidelines:
      "Wide angle showing all cones, synchronized start cue, visible line touches.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=B-hsX94VsF8",
    metricPrimaryKey: "changeOfDirectionMeasurement",
    lowerIsBetter: true,
  },
  {
    slug: "shooting-accuracy",
    name: "Shooting accuracy drill",
    sport: "soccer",
    description: "Timed shot cycle and target-hit tracking.",
    guidelines:
      "Behind-goal camera, visible target zones, fixed distance to goal.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=soccer+shooting+accuracy+drill+instruction",
    metricPrimaryKey: "shotTiming",
    lowerIsBetter: true,
  },
  {
    slug: "cone-dribble",
    name: "Cone dribble drill",
    sport: "soccer",
    description: "Dribble through fixed cone layout and return.",
    guidelines:
      "Top-side view preferred, consistent cone spacing, full path visible.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=soccer+cone+dribbling+drill+instruction",
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "shuttle-endurance",
    name: "Shuttle endurance test",
    sport: "soccer",
    description: "Multi-repetition shuttle workload test.",
    guidelines:
      "Field-length framing, clear rep markers, uninterrupted recording.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=soccer+shuttle+endurance+test+instruction",
    metricPrimaryKey: "repetitionCount",
    lowerIsBetter: false,
  },
] as const;

export const ROLE_OPTIONS = ["ATHLETE", "PARENT", "COACH", "ADMIN"] as const;
export const SELF_REGISTRATION_ROLE_OPTIONS = ["ATHLETE", "PARENT", "COACH"] as const;

export const POSITION_OPTIONS = [
  "GK",
  "DEF",
  "MID",
  "FWD",
  "UTIL",
] as const;

export const COMPETITION_LEVEL_OPTIONS = [
  "recreational",
  "academy",
  "elite",
  "school",
] as const;
