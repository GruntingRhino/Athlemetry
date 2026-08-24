export type PasswordResetDeliveryConfig = {
  url: string;
  bearerToken: string;
};

export function passwordResetIdentifier(email: string) {
  return `password-reset:${email.trim().toLowerCase()}`;
}

export function getPasswordResetDeliveryConfig(): PasswordResetDeliveryConfig | null {
  const url = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL?.trim();
  const bearerToken = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN?.trim();
  if (!url || !bearerToken) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return { url: parsed.toString(), bearerToken };
  } catch {
    return null;
  }
}
