import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

/**
 * Pre-recording checklist derived from a drill's capture protocol, so the
 * requirements (frame rate, camera view, what must stay in frame) are visible
 * before filming rather than only after an upload is rejected. Presentation
 * only: it reads protocol data and never changes what the checks require.
 * Server-only (imports the full protocol table); the page passes the result
 * to the client form.
 */
function formatFps(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} fps` : `${rounded.toFixed(1)} fps`;
}

function joinAngles(angles: string[]) {
  const names = angles.map((angle) => angle.replaceAll("-", " "));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Up to three items. Empty when the drill has no published protocol; nothing is invented. */
export function getBeforeYouFilmItems(drillSlug: string): string[] {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  if (!protocol) return [];

  const { camera } = protocol;
  const items: string[] = [];

  if (Number.isFinite(camera.minimumFps) && camera.minimumFps > 0) {
    items.push(`Record at ${formatFps(camera.minimumFps)} or higher. Check your phone's camera settings before you start.`);
  }
  if (camera.acceptedAngles.length > 0) {
    items.push(`Film from ${joinAngles(camera.acceptedAngles)} view.`);
  }

  const inFrame = camera.referenceInFrame.trim();
  const frameParts: string[] = [];
  if (camera.fullBodyRequired) frameParts.push("Keep the athlete's whole body in frame.");
  if (inFrame) frameParts.push(`Also keep in frame: ${inFrame}.`);
  if (frameParts.length > 0) items.push(frameParts.join(" "));

  return items;
}
