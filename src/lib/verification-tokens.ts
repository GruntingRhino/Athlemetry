import { createHash, randomBytes } from "crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verificationTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS);
}
