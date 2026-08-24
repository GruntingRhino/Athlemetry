import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveSeedAdmin } from "../prisma/seed-config";

describe("administrator seeding", () => {
  it("does not provision an administrator when credentials are absent", () => {
    expect(resolveSeedAdmin({})).toBeNull();
  });

  it("requires complete, strong administrator credentials", () => {
    expect(() => resolveSeedAdmin({ SEED_ADMIN_EMAIL: "admin@example.com" })).toThrow(/both/i);
    expect(() => resolveSeedAdmin({ SEED_ADMIN_EMAIL: "admin@example.com", SEED_ADMIN_PASSWORD: "short" })).toThrow(/16 characters/i);
  });

  it("accepts explicit administrator provisioning without embedding credentials", () => {
    expect(resolveSeedAdmin({
      SEED_ADMIN_EMAIL: " Admin@Example.com ",
      SEED_ADMIN_PASSWORD: "a-unique-test-password",
    })).toEqual({ email: "admin@example.com", password: "a-unique-test-password" });

    const source = readFileSync("prisma/seed.ts", "utf8");
    expect(source).not.toContain("admin1234");
    expect(source).not.toContain("admin@athlemetry.dev");
  });
});