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
  ["unknown", "Not sure"],
] as const;

export const HANDEDNESS_OPTIONS = [
  ["right", "Right"],
  ["left", "Left"],
  ["switch", "Switch"],
  ["unknown", "Not sure"],
] as const;

export const CLIP_QUALITY_OPTIONS = [
  ["excellent", "Excellent"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor / blurry"],
] as const;

export const DEFAULT_BASEBALL_LEAGUE = "regulation-60-5";

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
  distanceFeet: number;
  baseballLeague: string;
  notes: string;
  reviewRetentionDays: string;
};

/** The per-drill defaults that change when the drill changes. */
export function getDrillDefaults(drill: { slug: string; sport: string } | undefined) {
  const profile = getDrillCaptureProfile(drill);
  return { cameraAngle: profile.cameraAngle, distanceFeet: profile.measurementDistanceFeet };
}

export function createInitialValues(drills: FlowDrill[], selection: InitialSelection): UploadValues {
  const drill = drills.find((candidate) => candidate.id === selection.drillId);
  const defaults = getDrillDefaults(drill);
  return {
    sport: selection.sport,
    drillId: drill ? drill.id : "",
    recordingDate: "",
    location: "",
    frameRate: "",
    startFrame: "",
    finishFrame: "",
    repetitionHint: "",
    cameraAngle: defaults.cameraAngle,
    athleteHandedness: "unknown",
    clipQuality: "good",
    distanceFeet: defaults.distanceFeet,
    baseballLeague: DEFAULT_BASEBALL_LEAGUE,
    notes: "",
    reviewRetentionDays: "0",
  };
}

/** Local time formatted for `<input type="datetime-local">` (no timezone suffix). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const UPLOAD_DRAFT_STORAGE_KEY = "athlemetry.upload-draft.v1";

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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
  const distance = typeof source.distanceFeet === "number" && Number.isFinite(source.distanceFeet) && source.distanceFeet > 0 && source.distanceFeet <= 200
    ? source.distanceFeet
    : base.distanceFeet;

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
    distanceFeet: distance,
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
