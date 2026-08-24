import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPasswordResetDeliveryConfig,
  passwordResetIdentifier,
} from "@/lib/password-reset";

describe("password-reset delivery configuration", () => {
  const originalWebhookUrl = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
  const originalWebhookToken = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWebhookUrl === undefined) delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
    else process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = originalWebhookUrl;
    if (originalWebhookToken === undefined) delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN;
    else process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN = originalWebhookToken;
  });

  it("names password-reset tokens separately from other verification tokens", () => {
    expect(passwordResetIdentifier(" Athlete@Example.com ")).toBe("password-reset:athlete@example.com");
  });

  it("fails closed when the delivery integration is not completely configured", () => {
    delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
    delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN;

    expect(getPasswordResetDeliveryConfig()).toBeNull();

    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://mailer.example.test/reset";
    expect(getPasswordResetDeliveryConfig()).toBeNull();
  });

  it("accepts only an HTTPS delivery endpoint with a bearer credential", () => {
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "http://mailer.example.test/reset";
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN = "integration-secret";
    expect(getPasswordResetDeliveryConfig()).toBeNull();

    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://mailer.example.test/reset";
    expect(getPasswordResetDeliveryConfig()).toEqual({
      url: "https://mailer.example.test/reset",
      bearerToken: "integration-secret",
    });
  });
});
