import {
  BASEBALL_LEAGUE_OPTIONS,
  SPORT_OPTIONS,
  VALID_REVIEW_DAYS,
  type SportOption,
} from "@/lib/constants";
import { getDrillCaptureProfile } from "@/lib/drill-capture";

/**
 * Pure logic for the guided upload flow. Kept free of React, Prisma, and
 * browser globals so it can be unit-tested and imported by the client form.
 */

export type FlowDrill = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  guidelines?: string;
  /** Pre-recording checklist from the drill's capture protocol (computed on the server). */
  beforeYouFilm?: string[];
};

export const CAMERA_ANGLE_OPTIONS = [
  ["side", "Side view"],
  ["open-side", "Open-side / athlete-side"],
  ["diagonal", "Diagonal / game angle"],
  ["behind-goal", "Behind goal / endline"],
  ["behind-pitcher", "Behind pitcher"],
  ["behind-catcher", "Behind catcher / center field"],
  ["front-on", "Front-on"],
  ["overhead", "Overhead"],
] as const;

export const HANDEDNESS_OPTIONS = [
  ["right", "Right"],
  ["left", "Left"],
  ["switch", "Switch"],
] as const;

export const CLIP_QUALITY_OPTIONS = [
  ["excellent", "Excellent"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor / blurry"],
] as const;

/**
 * Optional selects start on an explicit empty "Not sure" option that posts
 * nothing: a pre-selected answer would read as the athlete's own claim.
 */
export const NOT_SURE_LABEL = "Not sure";

export function isSportOption(value: unknown): value is SportOption {
  return typeof value === "string" && (SPORT_OPTIONS as readonly string[]).includes(value);
}

/** Drills of one sport, in their given order. A null sport yields no drills. */
export function getDrillsForSport<T extends { sport: string }>(drills: T[], sport: SportOption | null): T[] {
  if (!sport) return [];
  return drills.filter((drill) => drill.sport === sport);
}

/** Sports that actually have at least one drill, in canonical order. */
export function getSportsWithDrills(drills: { sport: string }[]): SportOption[] {
  return SPORT_OPTIONS.filter((sport) => drills.some((drill) => drill.sport === sport));
}

export type InitialSelection = { sport: SportOption | null; drillId: string };

/**
 * Resolve the `?sport=` and `?drill=<slug>` query params into the starting
 * selection. A valid drill slug wins and also selects its sport. An unknown or
 * missing sport leaves the sport unselected: the flow never defaults to a sport.
 */
export function resolveInitialSelection(
  drills: FlowDrill[],
  params: { sport?: string | null; drill?: string | null },
): InitialSelection {
  const slug = typeof params.drill === "string" ? params.drill.trim() : "";
  const drill = slug ? drills.find((candidate) => candidate.slug === slug) : undefined;
  if (drill && isSportOption(drill.sport)) {
    return { sport: drill.sport, drillId: drill.id };
  }

  const sport = typeof params.sport === "string" ? params.sport.trim() : "";
  return { sport: isSportOption(sport) ? sport : null, drillId: "" };
}

export type OptionalFieldVisibility = {
  /** League distance preset; only baseball drills use it. */
  baseballLeague: boolean;
  /** Every drill has a capture profile with its own reference distance. */
  distance: boolean;
  repetitionPlaceholder: string;
};

/** Which optional detail fields apply to a drill. */
export function getOptionalFieldsForDrill(drill: { slug: string; sport: string } | undefined): OptionalFieldVisibility {
  if (!drill) {
    return { baseballLeague: false, distance: false, repetitionPlaceholder: "" };
  }
  return {
    baseballLeague: drill.sport === "baseball",
    distance: true,
    repetitionPlaceholder: drill.sport === "baseball" ? "10" : drill.sport === "basketball" ? "8" : "6",
  };
}

export type UploadValues = {
  sport: SportOption | null;
  drillId: string;
  recordingDate: string;
  location: string;
  frameRate: string;
  startFrame: string;
  finishFrame: string;
  repetitionHint: string;
  cameraAngle: string;
  athleteHandedness: string;
  clipQuality: string;
  /** What the user typed, in the drill's distance unit; blank when untouched. */
  distance: string;
  baseballLeague: string;
  notes: string;
  reviewRetentionDays: string;
};

export function createInitialValues(drills: FlowDrill[], selection: InitialSelection): UploadValues {
  const drill = drills.find((candidate) => candidate.id === selection.drillId);
  return {
    sport: selection.sport,
    drillId: drill ? drill.id : "",
    recordingDate: "",
    location: "",
    frameRate: "",
    startFrame: "",
    finishFrame: "",
    repetitionHint: "",
    cameraAngle: "",
    athleteHandedness: "",
    clipQuality: "",
    distance: "",
    baseballLeague: "",
    notes: "",
    reviewRetentionDays: "0",
  };
}

/** Local time formatted for `<input type="datetime-local">` (no timezone suffix). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const UPLOAD_DRAFT_STORAGE_KEY = "athlemetry.upload-draft.v2";

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DISTANCE_INPUT_PATTERN = /^[0-9]*[.,]?[0-9]*$/;

function pickString(source: Record<string, unknown>, key: string, maxLength: number): string {
  const value = source[key];
  return typeof value === "string" && value.length <= maxLength ? value : "";
}

function pickOption(source: Record<string, unknown>, key: string, allowed: readonly string[], fallback: string): string {
  const value = source[key];
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

/**
 * Parse a stored draft defensively. Anything malformed, oversized, or not
 * matching a known option is dropped; never trust sessionStorage contents.
 */
export function parseUploadDraft(raw: string | null, drills: FlowDrill[]): UploadValues | null {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const source = data as Record<string, unknown>;

  const sport = isSportOption(source.sport) ? source.sport : null;
  const drill = typeof source.drillId === "string" ? drills.find((candidate) => candidate.id === source.drillId) : undefined;
  const drillMatchesSport = Boolean(sport && drill && drill.sport === sport);
  const base = createInitialValues(drills, { sport, drillId: drillMatchesSport && drill ? drill.id : "" });

  const recordingDate = pickString(source, "recordingDate", 16);
  const distance = pickString(source, "distance", 8);

  return {
    ...base,
    recordingDate: DATETIME_LOCAL_PATTERN.test(recordingDate) ? recordingDate : "",
    location: pickString(source, "location", 80),
    frameRate: pickString(source, "frameRate", 8),
    startFrame: pickString(source, "startFrame", 12),
    finishFrame: pickString(source, "finishFrame", 12),
    repetitionHint: pickString(source, "repetitionHint", 6),
    cameraAngle: pickOption(source, "cameraAngle", CAMERA_ANGLE_OPTIONS.map(([value]) => value), base.cameraAngle),
    athleteHandedness: pickOption(source, "athleteHandedness", HANDEDNESS_OPTIONS.map(([value]) => value), base.athleteHandedness),
    clipQuality: pickOption(source, "clipQuality", CLIP_QUALITY_OPTIONS.map(([value]) => value), base.clipQuality),
    distance: DISTANCE_INPUT_PATTERN.test(distance) ? distance : "",
    baseballLeague: pickOption(source, "baseballLeague", BASEBALL_LEAGUE_OPTIONS.map((league) => league.key), base.baseballLeague),
    notes: pickString(source, "notes", 500),
    reviewRetentionDays: pickOption(source, "reviewRetentionDays", VALID_REVIEW_DAYS.map(String), base.reviewRetentionDays),
  };
}

/**
 * Combine a restored draft with the URL-derived starting selection. The URL
 * wins for sport and drill; drill-specific details from the draft are kept only
 * when the draft was for that same drill.
 */
export function applyDraft(
  initial: UploadValues,
  draft: UploadValues | null,
): UploadValues {
  if (!draft) return initial;

  const urlSelected = initial.sport !== null;
  if (!urlSelected) return { ...draft, recordingDate: draft.recordingDate || initial.recordingDate };

  const sameDrill = draft.drillId === initial.drillId && draft.sport === initial.sport;
  return {
    ...(sameDrill ? draft : initial),
    sport: initial.sport,
    drillId: initial.drillId,
    recordingDate: draft.recordingDate || initial.recordingDate,
    location: draft.location,
    notes: draft.notes,
  };
}

/* ---------------------------------------------------------------------------
 * Optional measurement distance
 *
 * The field starts empty. The posted field is named `measurementDistanceFeet`,
 * so a value typed in metres is converted to feet before it is sent. A typed
 * distance is the athlete's own statement, never metric evidence.
 * ------------------------------------------------------------------------ */

export type DistanceUnit = "m" | "ft";

const METERS_PER_FOOT = 0.3048;
const MAX_DISTANCE_FEET = 200;

/** Drills whose protocol lane is defined in whole metres (their reference length converts to a round metre figure). */
const METRIC_DISTANCE_DRILLS: ReadonlySet<string> = new Set([
  "sprint-20m",
  "passing-accuracy",
  "first-touch-control",
  "shooting-mechanics",
  "movement-efficiency",
  "baseball-throwing-mechanics",
]);

export function getDistanceUnit(drill: { slug: string } | undefined): DistanceUnit {
  return drill && METRIC_DISTANCE_DRILLS.has(drill.slug) ? "m" : "ft";
}

/** The capture profile's label, with its hard-coded "(ft)" swapped for the unit shown. */
export function getDistanceLabel(drill: { slug: string; sport: string } | undefined): string {
  const unit = getDistanceUnit(drill);
  const base = getDrillCaptureProfile(drill).distanceLabel.replace(/\s*\(ft\)\s*$/, "");
  return `${base} (${unit === "m" ? "metres" : "feet"})`;
}

/** Parse what the user typed. Null for blank, non-numeric, or non-positive input. */
export function parseDistanceInput(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The value to post as `measurementDistanceFeet`, or null when nothing valid was typed. */
export function distanceToPostedFeet(raw: string, unit: DistanceUnit): number | null {
  const value = parseDistanceInput(raw);
  if (value === null) return null;
  const feet = unit === "m" ? value / METERS_PER_FOOT : value;
  return Math.round(feet * 100) / 100;
}

/* ---------------------------------------------------------------------------
 * Client-side validation of the required essentials
 *
 * The server stays the authority. This only makes failures visible and
 * associated with their field. Untouched optional fields never block a submit.
 * ------------------------------------------------------------------------ */

export type UploadFieldKey =
  | "sport"
  | "drillId"
  | "video"
  | "recordingDate"
  | "location"
  | "frameRate"
  | "repetitionHint"
  | "startFrame"
  | "finishFrame"
  | "distance";

export type UploadErrors = Partial<Record<UploadFieldKey, string>>;

/** DOM order, which is also the order errors are listed and focused in. */
export const UPLOAD_FIELD_ORDER: readonly UploadFieldKey[] = [
  "sport",
  "drillId",
  "video",
  "recordingDate",
  "location",
  "frameRate",
  "repetitionHint",
  "startFrame",
  "finishFrame",
  "distance",
];

const DETAIL_FIELDS: ReadonlySet<UploadFieldKey> = new Set(["frameRate", "repetitionHint", "startFrame", "finishFrame", "distance"]);

/** True for fields inside the collapsed "Optional details" section. */
export function isDetailField(key: UploadFieldKey) {
  return DETAIL_FIELDS.has(key);
}

function isBlank(value: string) {
  return value.trim() === "";
}

function isWholeNumber(value: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return false;
  const number = Number(text);
  return number >= min && number <= max;
}

/**
 * Validate the form. Sport and drill are checked first and alone, because the
 * rest of the form is not shown until they are chosen. The optional numeric
 * fields mirror the server rules but only complain when something was typed.
 */
export function validateUploadValues(
  values: UploadValues,
  context: { hasVideo: boolean; unit: DistanceUnit },
): UploadErrors {
  if (!values.sport) return { sport: "Choose a sport." };
  if (!values.drillId) return { drillId: "Choose a drill." };

  const errors: UploadErrors = {};

  if (!context.hasVideo) errors.video = "Add a video file or record one with your camera.";

  if (isBlank(values.recordingDate) || Number.isNaN(new Date(values.recordingDate).getTime())) {
    errors.recordingDate = "Enter the date and time of the recording.";
  }
  if (values.location.trim().length < 2) {
    errors.location = "Enter where you recorded this, for example field, cage, or gym.";
  }

  if (!isBlank(values.frameRate)) {
    const fps = Number(values.frameRate.trim());
    if (!Number.isFinite(fps) || fps < 10 || fps > 240) {
      errors.frameRate = "Enter a frame rate between 10 and 240, or leave it blank.";
    }
  }
  if (!isBlank(values.repetitionHint) && !isWholeNumber(values.repetitionHint, 0, 500)) {
    errors.repetitionHint = "Enter a whole number from 0 to 500, or leave it blank.";
  }
  if (!isBlank(values.startFrame) && !isWholeNumber(values.startFrame, 0)) {
    errors.startFrame = "Enter a whole number, or leave it blank.";
  }
  if (!isBlank(values.finishFrame)) {
    if (!isWholeNumber(values.finishFrame, 1)) {
      errors.finishFrame = "Enter a whole number above 0, or leave it blank.";
    } else if (!errors.startFrame && !isBlank(values.startFrame) && Number(values.finishFrame) <= Number(values.startFrame)) {
      errors.finishFrame = "The finish frame must be after the start frame.";
    }
  }
  if (!isBlank(values.distance)) {
    const feet = distanceToPostedFeet(values.distance, context.unit);
    if (feet === null) errors.distance = "Enter a distance greater than 0, or leave it blank.";
    else if (feet > MAX_DISTANCE_FEET) errors.distance = "That distance is too large. Check the unit, or leave it blank.";
  }

  return errors;
}

export function listUploadErrors(errors: UploadErrors): Array<{ key: UploadFieldKey; message: string }> {
  return UPLOAD_FIELD_ORDER.flatMap((key) => {
    const message = errors[key];
    return message ? [{ key, message }] : [];
  });
}

/* ---------------------------------------------------------------------------
 * Upload progress and confirmation wording
 * ------------------------------------------------------------------------ */

export function describeUploadProgress(progress: number): { visible: string; announcement: string } {
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  return percent >= 100
    ? { visible: "Upload finished. Saving your clip.", announcement: "Upload finished. Saving your clip." }
    : { visible: `Uploading your clip: ${percent}%`, announcement: "Uploading your clip." };
}

export const QUEUED_CONFIRMATION = {
  heading: "Got it — your clip is uploaded.",
  body: "We're checking it now. You can close this page; the result will appear under Submissions.",
} as const;
