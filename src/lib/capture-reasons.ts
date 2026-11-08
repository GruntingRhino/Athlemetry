import type { CaptureAssessment } from "@/lib/capture-adherence";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

/**
 * Plain-language translation of the reason codes emitted by
 * `assessCaptureAdherence`. Presentation only: it never changes whether a clip
 * is rejected, only how the same facts are told to the athlete.
 */
export const GENERIC_CAPTURE_PROBLEM = "This recording didn't meet the capture requirements for this drill.";
export const GENERIC_CAPTURE_FIX = "Re-record following the setup and execution steps in the drill protocol.";

export type CaptureReasonAdvice = {
  /** Raw code, or null for the generic fallback. For the "Technical details" disclosure only. */
  code: string | null;
  problem: string;
  fix: string;
};

type AssessmentFacts = Pick<CaptureAssessment, "reasons" | "observedFps" | "requiredFps">;

function formatFps(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} fps` : `${rounded.toFixed(1)} fps`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function joinAngles(angles: string[]) {
  const names = angles.map((angle) => angle.replaceAll("-", " "));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function describeCaptureReasons(assessment: AssessmentFacts | null, drillSlug: string): CaptureReasonAdvice[] {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  const generic: CaptureReasonAdvice = { code: null, problem: GENERIC_CAPTURE_PROBLEM, fix: GENERIC_CAPTURE_FIX };
  if (!assessment || assessment.reasons.length === 0) return [generic];

  const requiredFps = isFiniteNumber(assessment.requiredFps) ? assessment.requiredFps : protocol?.camera.minimumFps ?? null;
  const observedFps = isFiniteNumber(assessment.observedFps) ? assessment.observedFps : null;
  const angles = protocol ? joinAngles(protocol.camera.acceptedAngles) : "";

  const known: Record<string, CaptureReasonAdvice> = {
    "protocol-unavailable": {
      code: "protocol-unavailable",
      problem: "This drill doesn't have a published capture protocol yet, so the clip can't be checked.",
      fix: "Pick a drill that has a capture protocol, or check back once its protocol is published.",
    },
    "frame-rate-unavailable": {
      code: "frame-rate-unavailable",
      problem: "We couldn't read the frame rate of this video.",
      fix: requiredFps !== null
        ? `Record again at ${formatFps(requiredFps)} or higher and upload the original file.`
        : "Record again at the frame rate listed in the drill protocol and upload the original file.",
    },
    "frame-rate-below-protocol-minimum": {
      code: "frame-rate-below-protocol-minimum",
      problem: observedFps !== null && requiredFps !== null
        ? `This clip was recorded at ${formatFps(observedFps)}. This drill needs ${formatFps(requiredFps)} or higher.`
        : "This clip was recorded at a lower frame rate than this drill needs.",
      fix: requiredFps !== null
        ? `In your phone's camera settings choose ${formatFps(requiredFps)} or higher, then re-record.`
        : "In your phone's camera settings choose the frame rate listed in the drill protocol, then re-record.",
    },
    "athlete-tracking-insufficient": {
      code: "athlete-tracking-insufficient",
      problem: "We couldn't follow the athlete through enough of the clip.",
      fix: "Keep the athlete in view for the whole clip, with nobody walking in front, and film in good light.",
    },
    "full-body-pose-coverage-insufficient": {
      code: "full-body-pose-coverage-insufficient",
      problem: "We couldn't see the athlete's whole body for enough of the clip.",
      fix: "Move the camera back so the athlete's whole body, head to feet, stays in frame throughout.",
    },
    "camera-angle-unverified": {
      code: "camera-angle-unverified",
      problem: "We couldn't confirm the camera angle.",
      fix: angles
        ? `Film from ${angles} and keep the phone stationary on a tripod or fixed support.`
        : "Film from the angle listed in the drill protocol and keep the phone stationary.",
    },
    "reference-geometry-unverified": {
      code: "reference-geometry-unverified",
      problem: "We couldn't find the measured reference points this drill needs.",
      fix: protocol
        ? `Set up the markers and lines as the protocol describes and keep them in frame the whole time: ${protocol.camera.referenceInFrame}.`
        : "Set up the markers and lines as the protocol describes and keep them in frame the whole time.",
    },
    "athlete-identity-unverified": {
      code: "athlete-identity-unverified",
      problem: "We couldn't confirm it was the same athlete throughout the clip.",
      fix: "Have only the athlete in frame while recording, and upload one uncut clip.",
    },
    "sport-drill-unverified": {
      code: "sport-drill-unverified",
      problem: "We couldn't confirm the clip shows this drill.",
      fix: "Record the whole drill in one take, following the execution steps in the protocol.",
    },
    "protocol-execution-unverified": {
      code: "protocol-execution-unverified",
      problem: "We couldn't confirm the drill was performed as the protocol describes.",
      fix: "Record one continuous take from the start position, following the execution steps in the protocol.",
    },
  };

  const advice: CaptureReasonAdvice[] = [];
  const seen = new Set<string>();
  let usedGeneric = false;
  for (const reason of assessment.reasons) {
    if (Object.hasOwn(known, reason)) {
      if (seen.has(reason)) continue;
      seen.add(reason);
      advice.push(known[reason]);
    } else if (!usedGeneric) {
      usedGeneric = true;
      advice.push(generic);
    }
  }
  return advice;
}
