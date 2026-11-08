import type { SportOption } from "@/lib/constants";

type QuickGuideProtocol = {
  sport: SportOption;
  camera: { acceptedAngles: readonly string[]; minimumFps: number; fullBodyRequired: boolean; referenceInFrame: string };
};

export type QuickGuideRow = {
  slug: string;
  sport: SportOption;
  /** Accepted camera views, e.g. "side or diagonal". */
  view: string;
  minimumFps: number;
  fullBodyRequired: boolean;
  referenceInFrame: string;
};

function joinViews(angles: readonly string[]) {
  if (angles.length <= 1) return angles.join("");
  if (angles.length === 2) return `${angles[0]} or ${angles[1]}`;
  return `${angles.slice(0, -1).join(", ")}, or ${angles[angles.length - 1]}`;
}

/** Athlete-facing capture facts derived only from the protocol data; nothing is added or inferred. */
export function buildQuickGuideRows(protocols: ReadonlyArray<readonly [string, QuickGuideProtocol]>): QuickGuideRow[] {
  return protocols.map(([slug, protocol]) => ({
    slug,
    sport: protocol.sport,
    view: joinViews(protocol.camera.acceptedAngles),
    minimumFps: protocol.camera.minimumFps,
    fullBodyRequired: protocol.camera.fullBodyRequired,
    referenceInFrame: protocol.camera.referenceInFrame,
  }));
}
