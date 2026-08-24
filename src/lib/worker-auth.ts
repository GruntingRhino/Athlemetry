import { timingSafeEqual } from "node:crypto";

export function isWorkerTokenAuthorized(authorizationHeader: string | null) {
  const configured = process.env.PROCESSING_WORKER_TOKEN?.trim();
  if (!configured || configured.length < 32 || !authorizationHeader?.startsWith("Bearer ")) return false;
  const supplied = authorizationHeader.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
