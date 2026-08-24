import { createHmac, timingSafeEqual } from "node:crypto";

const UPLOAD_CLAIM_TTL_MS = 15 * 60 * 1000;

type UploadClaim = {
  userId: string;
  storageKey: string;
  contentLength: number;
  contentType: string;
  sha256: string;
};

type SignedUploadClaim = UploadClaim & { expiresAt: number };

function claimSecret() {
  const secret = process.env.UPLOAD_CLAIM_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("UPLOAD_CLAIM_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", claimSecret()).update(payload).digest("base64url");
}

export function createUploadClaim(claim: UploadClaim, now = new Date()) {
  const payload = Buffer.from(JSON.stringify({
    ...claim,
    expiresAt: now.getTime() + UPLOAD_CLAIM_TTL_MS,
  } satisfies SignedUploadClaim)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyUploadClaim(token: string, expected: UploadClaim, now = new Date()) {
  try {
    const [payload, suppliedSignature, extra] = token.split(".");
    if (!payload || !suppliedSignature || extra) return false;
    const expectedSignature = signature(payload);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const computed = Buffer.from(expectedSignature, "base64url");
    if (supplied.length !== computed.length || !timingSafeEqual(supplied, computed)) return false;

    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SignedUploadClaim>;
    return claim.userId === expected.userId
      && claim.storageKey === expected.storageKey
      && claim.contentLength === expected.contentLength
      && claim.contentType === expected.contentType
      && claim.sha256 === expected.sha256
      && typeof claim.expiresAt === "number"
      && Number.isFinite(claim.expiresAt)
      && now.getTime() <= claim.expiresAt;
  } catch {
    return false;
  }
}
