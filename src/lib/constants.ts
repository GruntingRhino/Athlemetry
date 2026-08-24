export const APP_NAME = "Athlemetry";

export const TEAM_INVITATION_TTL_DAYS = 14;

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
    instructionVideoUrl: null,
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
    instructionVideoUrl: null,
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
    instructionVideoUrl: null,
    metricPrimaryKey: "shotTiming",
    lowerIsBetter: true,
  },
  {
    slug: "shooting-mechanics",
    name: "Shooting mechanics capture",
    sport: "soccer",
    description: "Standardized striking capture with a marked plant reference and visible goal-plane target grid.",
    guidelines:
      "Use a fixed diagonal or side view with the ball, plant marker cone, full body, goal frame, and target grid continuously visible.",
    instructionVideoUrl: null,
    metricPrimaryKey: "techniqueScore",
    lowerIsBetter: false,
  },
  {
    slug: "movement-efficiency",
    name: "Movement-efficiency capture",
    sport: "soccer",
    description: "Standardized change-of-direction route capture with measured cone geometry and a visible finish target.",
    guidelines:
      "Use a fixed diagonal or overhead view with the complete measured route, every cone, numbered finish target, and full body continuously visible.",
    instructionVideoUrl: null,
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "passing-accuracy",
    name: "Passing accuracy drill",
    sport: "soccer",
    description: "Ground-pass target session with visible lane and target references.",
    guidelines:
      "Use a stationary side or diagonal view with the full passing lane and numbered target continuously visible.",
    instructionVideoUrl: null,
    metricPrimaryKey: "accuracyScore",
    lowerIsBetter: false,
  },
  {
    slug: "first-touch-control",
    name: "First-touch control drill",
    sport: "soccer",
    description: "Receive a measured ground service into a marked control square with visible target and cone references.",
    guidelines:
      "Use a fixed diagonal camera that keeps the 5 m service lane, two control-square cones, ball, and numbered target in frame.",
    instructionVideoUrl: null,
    metricPrimaryKey: "accuracyScore",
    lowerIsBetter: false,
  },
  {
    slug: "cone-dribble",
    name: "Cone dribble drill",
    sport: "soccer",
    description: "Dribble through fixed cone layout and return.",
    guidelines:
      "Top-side, side, or diagonal view with consistent cone spacing and the full route visible.",
    instructionVideoUrl: null,
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
    instructionVideoUrl: null,
    metricPrimaryKey: "repetitionCount",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-pitch-velocity",
    name: "Pitch velocity capture",
    sport: "baseball",
    description: "Measure release-to-target timing; velocity is withheld unless calibrated speed clears validation.",
    guidelines:
      "Use synchronized calibrated radar or optical tracking with a 120 FPS open-side or behind-catcher recording. User-marked frames and entered distance do not authorize velocity or RPM output.",
    instructionVideoUrl: null,
    metricPrimaryKey: "speed",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-pitch-command",
    name: "Pitch command session",
    sport: "baseball",
    description: "Track strike-zone intent, clip quality, and command-session repeatability across a pitch set.",
    guidelines:
      "Use catcher or behind-pitcher angle, keep the full strike zone visible, and log total pitch attempts in repetition hint.",
    instructionVideoUrl: null,
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-throwing-mechanics",
    name: "Throwing mechanics capture",
    sport: "baseball",
    description: "Controlled throwing capture with a visible plate marker and numbered target reference.",
    guidelines:
      "Use a fixed open-side or diagonal view with the ball, full body, home-plate marker, and numbered target continuously visible.",
    instructionVideoUrl: null,
    metricPrimaryKey: "techniqueScore",
    lowerIsBetter: false,
  },
  {
    slug: "baseball-swing-timing",
    name: "Swing timing capture",
    sport: "baseball",
    description: "Measure load-to-contact timing and mark whether the clip is good enough for conservative batting feedback.",
    guidelines:
      "Preferred angle: open-side batting view with hands, hips, and contact point in frame. Use the 60.5 ft default unless the cage or bullpen setup is different. If contact is hidden or blurred, the system should surface an unclear-video note.",
    instructionVideoUrl: null,
    metricPrimaryKey: "frameBasedDuration",
    lowerIsBetter: true,
  },
  {
    slug: "basketball-spot-shooting",
    name: "Spot shooting assessment",
    sport: "basketball",
    description: "Standardized spot-shot session with visible court reference, hoop, ball, and attempt outcomes.",
    guidelines: "Use a fixed diagonal view with the selected marked spot, full body, rim, backboard, and ball visible for every shot.",
    instructionVideoUrl: null,
    metricPrimaryKey: "accuracyScore",
    lowerIsBetter: false,
  },
  {
    slug: "basketball-lane-agility",
    name: "Lane agility test",
    sport: "basketball",
    description: "Measured lane-agility route with visible boundary lines and turn events.",
    guidelines: "Use a fixed diagonal camera with the complete marked lane, all boundary lines, full body, and start/finish visible.",
    instructionVideoUrl: null,
    metricPrimaryKey: "changeOfDirectionMeasurement",
    lowerIsBetter: true,
  },
  {
    slug: "basketball-free-throw",
    name: "Free-throw assessment",
    sport: "basketball",
    description: "Ten-shot free-throw session with a visible line, rim, backboard, and attempt outcome evidence.",
    guidelines: "Use a fixed diagonal view with the free-throw line, full body, rim, backboard, and ball continuously visible through each attempt.",
    instructionVideoUrl: null,
    metricPrimaryKey: "accuracyScore",
    lowerIsBetter: false,
  },
  {
    slug: "basketball-form-capture",
    name: "Basketball form capture",
    sport: "basketball",
    description: "Shot-form capture and release timing anchored to visible free-throw or three-point markings.",
    guidelines: "Use a side or diagonal view, keep the free-throw or three-point line visible, and move the distance slider if the court setup is nonstandard.",
    instructionVideoUrl: null,
    metricPrimaryKey: "consistencyScore",
    lowerIsBetter: false,
  },
] as const;

export const ROLE_OPTIONS = ["ATHLETE", "PARENT", "COACH", "ADMIN"] as const;
export const SELF_REGISTRATION_ROLE_OPTIONS = ["ATHLETE", "PARENT", "COACH"] as const;

export const SPORT_POSITION_TAXONOMY = {
  soccer: [
    { value: "GK", label: "Goalkeeper" },
    { value: "DEF", label: "Defender" },
    { value: "MID", label: "Midfielder" },
    { value: "FWD", label: "Forward" },
    { value: "UTIL", label: "Utility" },
  ],
  baseball: [
    { value: "P", label: "Pitcher" },
    { value: "C", label: "Catcher" },
    { value: "1B", label: "First base" },
    { value: "2B", label: "Second base" },
    { value: "3B", label: "Third base" },
    { value: "SS", label: "Shortstop" },
    { value: "OF", label: "Outfield" },
    { value: "DH", label: "Designated hitter" },
    { value: "UTIL", label: "Utility" },
  ],
  basketball: [
    { value: "PG", label: "Point guard" },
    { value: "SG", label: "Shooting guard" },
    { value: "SF", label: "Small forward" },
    { value: "PF", label: "Power forward" },
    { value: "C", label: "Center" },
    { value: "UTIL", label: "Utility" },
  ],
} as const satisfies Record<SportOption, readonly { value: string; label: string }[]>;

export type AthletePosition =
  (typeof SPORT_POSITION_TAXONOMY)[SportOption][number]["value"];

export function getPositionOptionsForSport(sport: SportOption) {
  return SPORT_POSITION_TAXONOMY[sport];
}

export function getDefaultPositionForSport(sport: SportOption): AthletePosition {
  return SPORT_POSITION_TAXONOMY[sport][0].value;
}

export function isPositionValidForSport(
  sport: SportOption,
  position: string,
): position is AthletePosition {
  return SPORT_POSITION_TAXONOMY[sport].some((option) => option.value === position);
}

export const VALID_REVIEW_DAYS = [0, 7, 30, 90] as const;
export type ReviewRetentionDays = (typeof VALID_REVIEW_DAYS)[number];

export const COMPETITION_LEVEL_OPTIONS = [
  "recreational",
  "academy",
  "elite",
  "school",
] as const;

export const BASEBALL_LEAGUE_OPTIONS = [
  { key: "regulation-60-5", label: "Regulation (60.5 ft)", distanceFeet: 60.5 },
  { key: "little-league-majors-46", label: "Little League Majors (46 ft)", distanceFeet: 46 },
  { key: "little-league-intermediate-50-70", label: "Little League Intermediate (50/70) (50 ft)", distanceFeet: 50 },
] as const;

export type BaseballLeague = (typeof BASEBALL_LEAGUE_OPTIONS)[number]["key"];
