import { describe, expect, it } from "vitest";

import { registerSchema, validateVideoFile } from "@/lib/validators";

describe("registerSchema", () => {
  it("requires parent email for minors", () => {
    const result = registerSchema.safeParse({
      name: "Athlete One",
      email: "athlete@example.com",
      password: "supersecure",
      role: "ATHLETE",
      age: 14,
      position: "MID",
      team: "FC North",
      competitionLevel: "academy",
      gender: "female",
      parentEmail: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts adults without parent email", () => {
    const result = registerSchema.safeParse({
      name: "Coach One",
      email: "coach@example.com",
      password: "supersecure",
      role: "COACH",
      age: 28,
      position: "UTIL",
      team: "FC North",
      competitionLevel: "elite",
      gender: "male",
      parentEmail: "",
    });

    expect(result.success).toBe(true);
  });
});

describe("validateVideoFile", () => {
  it("accepts supported video mime types under size limit", () => {
    const file = new File([new Uint8Array(1024 * 1024)], "sample.mp4", {
      type: "video/mp4",
    });

    expect(validateVideoFile(file)).toEqual({ ok: true });
  });

  it("rejects unsupported formats", () => {
    const file = new File([new Uint8Array(1024)], "sample.avi", {
      type: "video/x-msvideo",
    });

    expect(() => validateVideoFile(file)).toThrowError("Unsupported file format.");
  });
});
