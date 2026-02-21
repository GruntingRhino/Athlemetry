import { z } from "zod";

import {
  ALLOWED_VIDEO_MIME_TYPES,
  COMPETITION_LEVEL_OPTIONS,
  MAX_VIDEO_SIZE_BYTES,
  POSITION_OPTIONS,
  SELF_REGISTRATION_ROLE_OPTIONS,
} from "@/lib/constants";

function emptyToUndefined(value: unknown) {
  return value === "" || value === null ? undefined : value;
}

export const registerSchema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.email().max(120),
    password: z.string().min(8).max(128),
    role: z.enum(SELF_REGISTRATION_ROLE_OPTIONS).default("ATHLETE"),
    age: z.coerce.number().int().min(6).max(80).optional(),
    position: z.enum(POSITION_OPTIONS).optional(),
    team: z.string().max(80).optional().default(""),
    competitionLevel: z.enum(COMPETITION_LEVEL_OPTIONS).optional(),
    gender: z.string().max(30).optional().default(""),
    parentEmail: z.email().optional().or(z.literal("")),
    shareInBenchmarks: z.coerce.boolean().optional().default(true),
    anonymizeForBenchmark: z.coerce.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.role === "ATHLETE" && typeof value.age !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["age"],
        message: "Age is required for athletes.",
      });
    }

    if (value.role === "ATHLETE" && !value.position) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["position"],
        message: "Position is required for athletes.",
      });
    }

    if (value.role === "ATHLETE" && !value.competitionLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["competitionLevel"],
        message: "Competition level is required for athletes.",
      });
    }

    if (value.role === "ATHLETE" && value.age !== undefined && value.age < 18 && !value.parentEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentEmail"],
        message: "Parent email is required for minors.",
      });
    }
  });

export const profileSchema = z
  .object({
    name: z.string().min(2).max(80),
    age: z.coerce.number().int().min(6).max(80),
    position: z.enum(POSITION_OPTIONS),
    team: z.string().max(80).optional().default(""),
    competitionLevel: z.enum(COMPETITION_LEVEL_OPTIONS),
    gender: z.string().max(30).optional().default(""),
    shareInBenchmarks: z.coerce.boolean().default(true),
    anonymizeForBenchmark: z.coerce.boolean().default(true),
  })
  .strict();

export const submissionMetadataSchema = z
  .object({
    drillDefinitionId: z.string().min(1),
    recordingDate: z
      .string()
      .trim()
      .min(1)
      .transform((value, ctx) => {
        const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
        const parsed = new Date(normalized);

        if (Number.isNaN(parsed.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid recording date.",
          });
          return z.NEVER;
        }

        return parsed.toISOString();
      }),
    location: z.string().min(2).max(80),
    drillType: z.string().min(2).max(80),
    frameRate: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(10).max(240).optional(),
    ),
    startFrame: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).optional(),
    ),
    finishFrame: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).optional(),
    ),
    repetitionHint: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).max(500).optional(),
    ),
  })
  .superRefine((value, ctx) => {
    if (
      value.startFrame !== undefined
      && value.finishFrame !== undefined
      && value.finishFrame <= value.startFrame
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finishFrame"],
        message: "finishFrame must be greater than startFrame.",
      });
    }
  });

export const reportSchema = z.object({
  submissionId: z.string().optional(),
  reason: z.string().min(4).max(120),
  details: z.string().max(400).optional().default(""),
});

export const manualOverrideSchema = z.object({
  submissionId: z.string().min(1),
  action: z.string().min(3).max(80),
  notes: z.string().max(500).optional().default(""),
  processingStatus: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "RETRYING"]).optional(),
  sprintTime: z.coerce.number().positive().optional(),
  accelerationTiming: z.coerce.number().positive().optional(),
  changeOfDirectionMeasurement: z.coerce.number().positive().optional(),
  shotTiming: z.coerce.number().positive().optional(),
  repetitionCount: z.coerce.number().int().nonnegative().optional(),
  consistencyScore: z.coerce.number().nonnegative().max(100).optional(),
});

export function validateVideoFile(file: File): { ok: true } {
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number])) {
    throw new Error("Unsupported file format.");
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video exceeds ${Math.floor(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return { ok: true };
}
