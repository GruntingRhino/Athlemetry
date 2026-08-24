import { z } from "zod";

import {
  ALLOWED_VIDEO_MIME_TYPES,
  BASEBALL_LEAGUE_OPTIONS,
  COMPETITION_LEVEL_OPTIONS,
  isPositionValidForSport,
  MAX_VIDEO_SIZE_BYTES,
  SELF_REGISTRATION_ROLE_OPTIONS,
  SPORT_OPTIONS,
  VALID_REVIEW_DAYS,
} from "@/lib/constants";

function emptyToUndefined(value: unknown) {
  return value === "" || value === null ? undefined : value;
}

const USER_CONTENT_CONTACT_DETAIL_PATTERN = /(?:\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b|\b(?:https?:\/\/|www\.)\S+|\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b)/i;

export function containsUserContentContactDetails(value: string) {
  return USER_CONTENT_CONTACT_DETAIL_PATTERN.test(value);
}

export const registerSchema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.email().max(120),
    password: z.string().min(8).max(128),
    role: z.enum(SELF_REGISTRATION_ROLE_OPTIONS).default("ATHLETE"),
    age: z.coerce.number().int().min(6).max(80).optional(),
    primarySport: z.enum(SPORT_OPTIONS).optional(),
    performanceGoal: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(500).optional()),
    position: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(16).optional()),
    team: z.string().max(80).optional().default(""),
    competitionLevel: z.enum(COMPETITION_LEVEL_OPTIONS).optional(),
    gender: z.string().max(30).optional().default(""),
    parentEmail: z.email().optional().or(z.literal("")),
    referralCode: z.preprocess(emptyToUndefined, z.string().trim().max(24).optional()),
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

    if (value.role === "ATHLETE" && !value.primarySport) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primarySport"],
        message: "Primary sport is required for athletes.",
      });
    }

    if (
      value.role === "ATHLETE"
      && value.primarySport
      && value.position
      && !isPositionValidForSport(value.primarySport, value.position)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["position"],
        message: "Position is not valid for the selected primary sport.",
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
    primarySport: z.enum(SPORT_OPTIONS),
    performanceGoal: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(500).optional()),
    position: z.string().trim().min(1).max(16),
    team: z.string().max(80).optional().default(""),
    competitionLevel: z.enum(COMPETITION_LEVEL_OPTIONS),
    gender: z.string().max(30).optional().default(""),
    shareInBenchmarks: z.coerce.boolean().default(true),
    anonymizeForBenchmark: z.coerce.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isPositionValidForSport(value.primarySport, value.position)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["position"],
        message: "Position is not valid for the selected primary sport.",
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must differ from the current password.",
      });
    }
  });

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(120),
}).strict();

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(256),
  newPassword: z.string().min(8).max(128),
}).strict();

export const modelTrainingConsentSchema = z.object({
  granted: z.boolean(),
}).strict();

export const submissionShareSchema = z.object({
  recipientEmail: z.string().trim().email().max(254),
}).strict();

export const coachingPlanActionCompletionSchema = z.object({
  actionIndex: z.coerce.number().int().min(0).max(99),
  completed: z.boolean(),
}).strict();

export const goalProgressCheckInSchema = z.object({
  progressPercent: z.coerce.number().int().min(0).max(100),
  note: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(500).optional()),
}).strict().superRefine((value, ctx) => {
  if (value.note && containsUserContentContactDetails(value.note)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "Do not include contact details or external links in a check-in note.",
    });
  }
});

export const teamCreationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  sport: z.enum(SPORT_OPTIONS),
}).strict();

export const teamInvitationSchema = z.object({
  recipientEmail: z.string().trim().email().max(254),
}).strict();

export const consentApprovalSchema = z.object({
  athleteEmail: z.email().max(120),
  granted: z.boolean().optional().default(true),
}).strict();

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
    cameraAngle: z.preprocess(
      emptyToUndefined,
      z.enum(["side", "open-side", "diagonal", "behind-goal", "behind-pitcher", "behind-catcher", "front-on", "overhead", "unknown"]).optional(),
    ),
    athleteHandedness: z.preprocess(
      emptyToUndefined,
      z.enum(["right", "left", "switch", "unknown"]).optional(),
    ),
    clipQuality: z.preprocess(
      emptyToUndefined,
      z.enum(["excellent", "good", "fair", "poor"]).optional(),
    ),
    measurementDistanceFeet: z.preprocess(
      emptyToUndefined,
      z.coerce.number().positive().max(200).optional(),
    ),
    baseballLeague: z.preprocess(
      emptyToUndefined,
      z.enum(BASEBALL_LEAGUE_OPTIONS.map((option) => option.key) as [string, ...string[]]).optional(),
    ),
    notes: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
    reviewRetentionDays: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().refine(
        (value) => VALID_REVIEW_DAYS.includes(value as 0 | 7 | 30 | 90),
        { message: "Must be 0, 7, 30, or 90." },
      ).optional(),
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
  coachingPlanId: z.string().optional(),
  recommendationActionIndex: z.coerce.number().int().min(0).max(99).optional(),
  disputedFrameIndex: z.coerce.number().int().min(0).max(10_000_000).optional(),
  accuracyRating: z.coerce.number().int().min(1).max(5).optional(),
  usefulnessRating: z.coerce.number().int().min(1).max(5).optional(),
  metricName: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
  reportedValue: z.preprocess(emptyToUndefined, z.coerce.number().finite().nonnegative().max(1_000_000).optional()),
  requestType: z.enum(["ISSUE", "HUMAN_REVIEW", "REPROCESS"]).default("ISSUE"),
  reason: z.string().trim().min(4).max(120),
  details: z.string().trim().max(400).optional().default(""),
}).strict().superRefine((value, ctx) => {
  const hasSubmissionScope = Boolean(value.submissionId);
  const hasRecommendationScope = Boolean(value.coachingPlanId);
  if (hasSubmissionScope === hasRecommendationScope) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["submissionId"], message: "Select exactly one feedback scope." });
  }
  if (hasRecommendationScope && value.recommendationActionIndex === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recommendationActionIndex"], message: "Select a recommendation action." });
  }
  if (!hasRecommendationScope && value.recommendationActionIndex !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recommendationActionIndex"], message: "Recommendation scope is required." });
  }
  if (hasRecommendationScope && (value.metricName || value.reportedValue !== undefined || value.requestType === "REPROCESS")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coachingPlanId"], message: "Recommendation feedback cannot change metrics or request reprocessing." });
  }
  for (const field of ["reason", "details"] as const) {
    if (containsUserContentContactDetails(value[field])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Do not include contact details or external links in feedback.",
      });
    }
  }
});

export const refundRequestSchema = z.object({
  reason: z.string().trim().min(3).max(160),
  details: z.preprocess(emptyToUndefined, z.string().trim().max(2_000).optional()),
}).strict().superRefine((value, ctx) => {
  for (const field of ["reason", "details"] as const) {
    if (containsUserContentContactDetails(value[field] ?? "")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Do not include contact details or external links." });
    }
  }
});

export const reportStatusUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]),
  resolutionNote: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(500).optional()),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "RESOLVED" || value.status === "DISMISSED") && !value.resolutionNote) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolutionNote"],
      message: "A resolution note is required when resolving or dismissing a report.",
    });
  }

  if (value.resolutionNote && containsUserContentContactDetails(value.resolutionNote)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolutionNote"],
      message: "Do not include contact details or external links in a resolution note.",
    });
  }
});

export const submissionKeyMomentSchema = z.object({
  frameIndex: z.coerce.number().int().min(0).max(10_000_000),
  label: z.string().trim().min(3).max(80),
  note: z.string().trim().min(3).max(300),
}).strict().superRefine((value, ctx) => {
  for (const field of ["label", "note"] as const) {
    if (containsUserContentContactDetails(value[field])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Do not include contact details or external links in a reviewed key moment.",
      });
    }
  }
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

export const modelRetrainingRequestSchema = z.object({
  notes: z.string().trim().min(3).max(500).optional(),
}).strict();

export function validateVideoFile(file: File): { ok: true } {
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number])) {
    throw new Error("Unsupported file format.");
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video exceeds ${Math.floor(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return { ok: true };
}
