export const APP_NAME = "Athlemetry";

export const MAX_VIDEO_SIZE_MB = Number.parseInt(process.env.MAX_VIDEO_SIZE_MB ?? "200", 10);
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export const SPORT_OPTIONS = ["soccer", "baseball", "basketball"] as const;
export type SportOption = (typeof SPORT_OPTIONS)[number];

export const SPORT_LABELS: Record<SportOption, string> = {
  soccer: "Soccer",
  baseball: "Baseball",
  basketball: "Basketball",
};

export const SPORT_DESCRIPTIONS: Record<SportOption, string> = {
  soccer: "Linear speed, change of direction, striking, and repeatability drills with field-line aware defaults.",
  baseball:
    "Pitching and batting workflows with angle-aware upload guidance, conservative video interpretation, and honest confidence notes.",
  basketball:
    "Shot-form capture and court-line calibration with free-throw and three-point defaults that stay editable.",
};

export const STANDARD_DRILLS = [
  {
    slug: "sprint-20m",
    name: "20-meter sprint",
    sport: "soccer",
    description: "Linear sprint across 20 meters with line-aware timing defaults.",
    guidelines:
      "Side or diagonal view, fixed tripod, full 20m lane visible, and clean start/finish markers.",
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
      "Wide side or diagonal shot showing all cones, synchronized start cue, and visible line touches.",
    instructionVideoUrl: "https://www.youtube.com/watch?v=B-hsX94VsF8",
    metricPrimaryKey: "changeOfDirectionMeasurement",
    lowerIsBetter: true,
  },
  {
    slug: "shooting-accuracy",
    name: "Shooting accuracy drill",
    sport: "soccer",
    description: "Timed shot cycle and target-hit tracking anchored to visible goal markings.",
    guidelines:
      "Behind-goal or diagonal view, visible target zones, and a fixed distance to goal.",
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
      "Top-side, side, or diagonal view with consistent cone spacing and the full route visible.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=soccer+cone+dribbling+drill+instruction",
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "shuttle-endurance",
    name: "Shuttle endurance test",
    sport: "soccer",
    description: "Multi-repetition shuttle workload test with clear route markers.",
    guidelines:
      "Field-length framing, clear rep markers, and uninterrupted recording.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=soccer+shuttle+endurance+test+instruction",
    metricPrimaryKey: "repetitionCount",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-pitch-velocity",
    name: "Pitch velocity capture",
    sport: "baseball",
    description: "Estimate pitch travel time and velocity from release-to-catch frames when the clip is usable.",
    guidelines:
      "Preferred angle: open-side or behind-catcher view with release and catch both visible. If the ball path is blurred or occluded, spin/RPM should be marked unavailable.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=baseball+pitch+velocity+video+mechanics",
    metricPrimaryKey: "frameBasedDuration",
    lowerIsBetter: true,
  },
  {
    slug: "baseball-pitch-command",
    name: "Pitch command session",
    sport: "baseball",
    description: "Track strike-zone intent, clip quality, and command-session repeatability across a pitch set.",
    guidelines:
      "Use catcher or behind-pitcher angle, keep the full strike zone visible, and log total pitch attempts in repetition hint.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=baseball+pitch+command+bullpen+camera+angle",
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-swing-timing",
    name: "Swing timing capture",
    sport: "baseball",
    description: "Measure load-to-contact timing and mark whether the clip is good enough for conservative batting feedback.",
    guidelines:
      "Preferred angle: open-side batting view with hands, hips, and contact point in frame. Use the 60.5 ft default unless the cage or bullpen setup is different. If contact is hidden or blurred, the system should surface an unclear-video note.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=baseball+swing+mechanics+camera+angle",
    metricPrimaryKey: "frameBasedDuration",
    lowerIsBetter: true,
  },
  {
    slug: "basketball-form-capture",
    name: "Basketball form capture",
    sport: "basketball",
    description: "Shot-form capture and release timing anchored to visible free-throw or three-point markings.",
    guidelines: "Use a side or diagonal view, keep the free-throw or three-point line visible, and move the distance slider if the court setup is nonstandard.",
    instructionVideoUrl:
      "https://www.youtube.com/results?search_query=basketball+shooting+form+camera+angle",
    metricPrimaryKey: "consistencyScore",
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
