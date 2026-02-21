import { describe, expect, it } from "vitest";

import {
  registerSchema,
  submissionMetadataSchema,
  validateVideoFile,
} from "@/lib/validators";

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
      gender: "male",
      parentEmail: "",
    });

    expect(result.success).toBe(true);
  });

  it("requires athlete profile fields only for ATHLETE role", () => {
    const result = registerSchema.safeParse({
      name: "Athlete Two",
      email: "athlete2@example.com",
      password: "supersecure",
      role: "ATHLETE",
      age: 16,
      parentEmail: "parent@example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects ADMIN in public registration schema", () => {
    const result = registerSchema.safeParse({
      name: "Admin One",
      email: "admin-one@example.com",
      password: "supersecure",
      role: "ADMIN",
    });

    expect(result.success).toBe(false);
  });
});

describe("submissionMetadataSchema", () => {
  it("accepts datetime-local recordingDate values", () => {
    const result = submissionMetadataSchema.safeParse({
      drillDefinitionId: "drill-1",
      recordingDate: "2026-02-20T10:00",
      location: "Training Ground A",
      drillType: "sprint-20m",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recordingDate).toMatch(/Z$/);
    }
  });

  it("treats empty optional numeric metadata fields as undefined", () => {
    const result = submissionMetadataSchema.safeParse({
      drillDefinitionId: "drill-1",
      recordingDate: "2026-02-20T10:00",
      location: "Training Ground A",
      drillType: "sprint-20m",
      frameRate: "",
      startFrame: "",
      finishFrame: "",
      repetitionHint: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frameRate).toBeUndefined();
      expect(result.data.startFrame).toBeUndefined();
      expect(result.data.finishFrame).toBeUndefined();
      expect(result.data.repetitionHint).toBeUndefined();
    }
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
