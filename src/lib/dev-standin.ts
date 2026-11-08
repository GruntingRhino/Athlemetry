/**
 * DEV-ONLY stand-in analyzer (SPEC S11-A, D16).
 *
 * Lets the whole app (upload -> queue -> analysis -> result pages) be exercised
 * before the pre-trained CV model exists, by sampling frames and asking a
 * LOCAL vision-language model for a qualitative description and grade.
 *
 * It is plumbing, not measurement. By construction its output:
 *   - reports zero computer-vision evidence and reliability "unavailable", so
 *     `mapVisionAnalysisToMetrics` yields no performance metric and capture
 *     adherence never verifies;
 *   - carries a model version no validation record can be bound to;
 *   - keeps the grade only in a labelled, non-validated report;
 *   - refuses to run in production or any deployed environment, with any model
 *     that runs off-machine, or against a non-loopback server.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import type { VisionAnalysisResult } from "@/lib/vision-analysis";

const execFileAsync = promisify(execFile);

export const DEV_STANDIN_ENGINE = "dev-vlm-standin";
export const DEV_STANDIN_MODEL_VERSION = "dev-vlm-standin-unvalidated";

const DEFAULT_FRAME_COUNT = 6;
const MAX_FRAME_COUNT = 12;
const DEFAULT_TIMEOUT_MS = 180_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type Env = Readonly<Record<string, string | undefined>>;

export type DevStandInConfig =
  | { enabled: false }
  | { enabled: true; model: string; ollamaUrl: string; frameCount: number; timeoutMs: number };

export function devStandInConfig(env: Env = process.env): DevStandInConfig {
  if (env.DEV_STANDIN_ANALYZER?.trim() !== "true") return { enabled: false };

  if (env.NODE_ENV === "production" || env.VERCEL_ENV) {
    throw new Error("The dev stand-in analyzer must not run in production or deployed environments.");
  }

  const model = env.DEV_STANDIN_MODEL?.trim();
  if (!model) throw new Error("DEV_STANDIN_MODEL is required when the dev stand-in analyzer is enabled.");
  if (/(^|[:\-_])cloud$/i.test(model)) {
    throw new Error("Cloud models run off-machine; the dev stand-in analyzer accepts local models only.");
  }

  const rawUrl = env.DEV_STANDIN_OLLAMA_URL?.trim() || "http://127.0.0.1:11434";
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DEV_STANDIN_OLLAMA_URL is not a valid URL.");
  }
  if (url.protocol !== "http:" || url.username || url.password || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("DEV_STANDIN_OLLAMA_URL must be a loopback http URL so footage never leaves this machine.");
  }

  const requested = Number.parseInt(env.DEV_STANDIN_FRAME_COUNT ?? "", 10);
  const frameCount = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, MAX_FRAME_COUNT) : DEFAULT_FRAME_COUNT;
  const timeout = Number.parseInt(env.DEV_STANDIN_TIMEOUT_MS ?? "", 10);

  return {
    enabled: true,
    model,
    ollamaUrl: url.origin,
    frameCount,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

// ---------------------------------------------------------------------------
// Model output contract
// ---------------------------------------------------------------------------

const CONTACT_OR_LINK = /https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+/i;
const safeText = (max: number) =>
  z.string().max(max).refine((value) => !CONTACT_OR_LINK.test(value), "Links and contact details are not allowed.");

const vlmOutputSchema = z.strictObject({
  drillShown: z.boolean().describe("true only if the frames clearly show the named drill being performed"),
  confidence: z.number().min(0).max(1).describe("a decimal from 0.0 to 1.0, NOT a percentage"),
  grade: z.number().int().min(0).max(100).describe("whole number from 0 to 100"),
  summary: safeText(600).describe("one or two plain sentences"),
  observations: z.array(safeText(300)).max(6).describe("up to 6 short observations"),
  issues: z.array(safeText(300)).max(6).describe("up to 6 short form issues"),
  recommendations: z.array(safeText(300)).max(4).describe("up to 4 short suggestions"),
});

export type VlmOutput = Omit<z.infer<typeof vlmOutputSchema>, "grade"> & { grade: number | null };

export const VLM_JSON_SCHEMA = z.toJSONSchema(vlmOutputSchema);

export function parseVlmOutput(raw: string): VlmOutput {
  const result = vlmOutputSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "(root)"))].join(", ");
    throw new Error(`Model output failed validation (${fields}).`);
  }
  const parsed = result.data;
  return { ...parsed, grade: parsed.drillShown ? parsed.grade : null };
}

// ---------------------------------------------------------------------------
// Mapping into the vision_core evidence schema (with zero CV evidence)
// ---------------------------------------------------------------------------

export type VideoProbe = { fps: number; width: number; height: number; durationSeconds: number; frameCount: number };

export type DevStandInReport = {
  engine: typeof DEV_STANDIN_ENGINE;
  validated: false;
  notice: string;
  model: string | null;
  drillShown: boolean;
  confidence: number;
  grade: number | null;
  summary: string;
  observations: string[];
  issues: string[];
  recommendations: string[];
};

const NOTICE = "Dev stand-in: a vision-language model's qualitative opinion for testing the app. Not a measurement and not validated.";

export function buildStandInAnalysis(input: {
  sport: VisionAnalysisResult["analysis"]["sport"];
  drill: string;
  probe: VideoProbe;
  vlm: VlmOutput;
  model?: string;
}): { analysis: VisionAnalysisResult; report: DevStandInReport } {
  const { probe, vlm } = input;
  const analysis: VisionAnalysisResult = {
    evidence: {
      source_path: DEV_STANDIN_ENGINE,
      fps: probe.fps,
      width: probe.width,
      height: probe.height,
      duration_seconds: probe.durationSeconds,
      decoded_frames: probe.frameCount,
      analyzed_frames: 0,
      athlete_detected_frames: 0,
      athlete_detection_rate: 0,
      pose_detected_frames: 0,
      pose_detection_rate: 0,
      athlete_tracked_frames: 0,
      athlete_tracking_rate: 0,
      detector: DEV_STANDIN_ENGINE,
      pose_backend: "none",
      calibration_method: null,
    },
    analysis: {
      sport: input.sport,
      drill: input.drill,
      metrics: {},
      actions: [],
      weaknesses: [],
      recommendations: [],
      overall_score: null,
      reliability: {
        status: "unavailable",
        score: 0,
        pose_coverage: 0,
        calibration_available: false,
        limitations: [NOTICE],
      },
    },
  };
  const report: DevStandInReport = {
    engine: DEV_STANDIN_ENGINE,
    validated: false,
    notice: NOTICE,
    model: input.model ?? null,
    drillShown: vlm.drillShown,
    confidence: vlm.confidence,
    grade: vlm.grade,
    summary: vlm.summary,
    observations: vlm.observations,
    issues: vlm.issues,
    recommendations: vlm.recommendations,
  };
  return { analysis, report };
}

const storedReportSchema = z.strictObject({
  engine: z.literal(DEV_STANDIN_ENGINE),
  validated: z.literal(false),
  notice: z.string().max(400),
  model: z.string().max(200).nullable(),
  drillShown: z.boolean(),
  confidence: z.number().min(0).max(1),
  grade: z.number().int().min(0).max(100).nullable(),
  summary: safeText(600),
  observations: z.array(safeText(300)).max(6),
  issues: z.array(safeText(300)).max(6),
  recommendations: z.array(safeText(300)).max(4),
});

/** Whether the labelled dev panel may be shown at all (flag on, not production, config valid). */
export function devStandInVisible(env: Env = process.env): boolean {
  try {
    return devStandInConfig(env).enabled;
  } catch {
    return false;
  }
}

/** Reads a stored dev report from submission metadata, or null if absent/tampered. */
export function readDevStandInReport(metadata: unknown): DevStandInReport | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const parsed = storedReportSchema.safeParse((metadata as Record<string, unknown>).devStandIn);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// I/O (injectable for tests)
// ---------------------------------------------------------------------------

export type StandInDeps = {
  probe: (videoPath: string) => Promise<VideoProbe>;
  extractFrames: (videoPath: string, count: number, durationSeconds: number) => Promise<{ frames: string[]; cleanup: () => Promise<void> }>;
  chat: (request: { model: string; url: string; system: string; prompt: string; images: string[]; timeoutMs: number }) => Promise<string>;
};

async function probeVideo(videoPath: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=r_frame_rate,width,height,duration,nb_frames",
    "-show_entries", "format=duration",
    "-of", "json", videoPath,
  ], { timeout: 30_000 });
  const parsed = JSON.parse(stdout) as { streams?: Array<Record<string, string>>; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error("No video stream found.");
  const [num, den] = (stream.r_frame_rate ?? "").split("/").map(Number);
  const fps = den ? num / den : num;
  const duration = Number.parseFloat(stream.duration ?? parsed.format?.duration ?? "");
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (![fps, duration, width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Video metadata is incomplete.");
  }
  const counted = Number.parseInt(stream.nb_frames ?? "", 10);
  return {
    fps,
    width,
    height,
    durationSeconds: duration,
    frameCount: Number.isFinite(counted) && counted > 0 ? counted : Math.round(fps * duration),
  };
}

async function extractFrames(videoPath: string, count: number, durationSeconds: number) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "athlemetry-standin-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const frames: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const seconds = (durationSeconds * (index + 0.5)) / count;
      const output = path.join(directory, `frame-${index}.jpg`);
      await execFileAsync("ffmpeg", [
        "-v", "error", "-y", "-ss", seconds.toFixed(3), "-i", videoPath,
        "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", output,
      ], { timeout: 30_000 });
      frames.push((await readFile(output)).toString("base64"));
    }
    return { frames, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function ollamaChat(request: Parameters<StandInDeps["chat"]>[0]) {
  const response = await fetch(`${request.url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(request.timeoutMs),
    body: JSON.stringify({
      model: request.model,
      stream: false,
      format: VLM_JSON_SCHEMA,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt, images: request.images },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Model server returned ${response.status}.`);
  const body = (await response.json()) as { message?: { content?: string } };
  if (typeof body.message?.content !== "string") throw new Error("Model server returned no content.");
  return body.message.content;
}

const REAL_DEPS: StandInDeps = { probe: probeVideo, extractFrames, chat: ollamaChat };

const SYSTEM_PROMPT = [
  "You assist a developer testing a sports-video app. You see evenly spaced frames from one clip.",
  "Answer ONLY with JSON matching the requested schema. No prose outside the JSON.",
  "Be conservative: if the frames do not clearly show the named drill being performed, set drillShown to false.",
  "Never state speeds, times, distances or angles; you cannot measure them from still frames.",
  "grade is a rough whole-number 0-100 impression of form and completion. confidence is a decimal between 0.0 and 1.0, never a percentage. Do not include links or contact details.",
].join(" ");

export async function runDevStandInAnalysis(
  input: { videoPath: string; sport: VisionAnalysisResult["analysis"]["sport"]; drill: string },
  config: Extract<DevStandInConfig, { enabled: true }>,
  deps: StandInDeps = REAL_DEPS,
): Promise<{ analysis: VisionAnalysisResult; report: DevStandInReport }> {
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const probe = await deps.probe(input.videoPath);
    const extracted = await deps.extractFrames(input.videoPath, config.frameCount, probe.durationSeconds);
    cleanup = extracted.cleanup;
    if (extracted.frames.length === 0) throw new Error("No frames could be extracted.");
    const raw = await deps.chat({
      model: config.model,
      url: config.ollamaUrl,
      system: SYSTEM_PROMPT,
      prompt: `Sport: ${input.sport}. Drill: ${input.drill}. Describe what the frames show and grade the attempt.`,
      images: extracted.frames,
      timeoutMs: config.timeoutMs,
    });
    const vlm = parseVlmOutput(raw);
    return buildStandInAnalysis({ sport: input.sport, drill: input.drill, probe, vlm, model: config.model });
  } catch (error) {
    throw new Error(`Dev stand-in analyzer failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
  } finally {
    if (cleanup) await cleanup().catch(() => undefined);
  }
}
