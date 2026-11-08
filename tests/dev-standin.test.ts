import { beforeEach, describe, expect, it, vi } from "vitest";

import { assessCaptureAdherence } from "@/lib/capture-adherence";
import {
  buildStandInAnalysis,
  DEV_STANDIN_ENGINE,
  DEV_STANDIN_MODEL_VERSION,
  devStandInConfig,
  devStandInVisible,
  parseVlmOutput,
  readDevStandInReport,
  runDevStandInAnalysis,
  type VideoProbe,
} from "@/lib/dev-standin";
import { mapVisionAnalysisToMetrics } from "@/lib/vision-analysis";

const on = { DEV_STANDIN_ANALYZER: "true", DEV_STANDIN_MODEL: "qwen2.5vl:3b", NODE_ENV: "development" } as const;

const goodVlm = {
  drillShown: true,
  confidence: 0.8,
  grade: 72,
  summary: "An athlete runs in a straight line.",
  observations: ["Upright posture"],
  issues: ["Short stride"],
  recommendations: ["Drive the knees"],
};

const probe: VideoProbe = { fps: 30, width: 1280, height: 720, durationSeconds: 4.2, frameCount: 126 };

describe("devStandInConfig", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(devStandInConfig({ NODE_ENV: "development" })).toEqual({ enabled: false });
    expect(devStandInConfig({ DEV_STANDIN_ANALYZER: "false", NODE_ENV: "development" })).toEqual({ enabled: false });
    expect(devStandInConfig({ DEV_STANDIN_ANALYZER: "1", NODE_ENV: "development" })).toEqual({ enabled: false });
  });

  it("refuses to run in production, however it is configured", () => {
    expect(() => devStandInConfig({ ...on, NODE_ENV: "production" })).toThrow(/production/i);
    expect(() => devStandInConfig({ ...on, VERCEL_ENV: "production" })).toThrow(/production/i);
    expect(() => devStandInConfig({ ...on, VERCEL_ENV: "preview" })).toThrow(/production|deployed/i);
  });

  it("requires an explicit model rather than defaulting to one", () => {
    expect(() => devStandInConfig({ DEV_STANDIN_ANALYZER: "true", NODE_ENV: "development" })).toThrow(/DEV_STANDIN_MODEL/);
  });

  it.each(["glm-5.2:cloud", "gemma4:31b-cloud", "x:CLOUD"])("rejects off-machine model %s", (model) => {
    expect(() => devStandInConfig({ ...on, DEV_STANDIN_MODEL: model })).toThrow(/off-machine|cloud/i);
  });

  it.each([
    "https://example.com",
    "http://10.0.0.5:11434",
    "http://localhost.evil.com:11434",
    "http://127.0.0.1@evil.com:11434",
    "http://127.0.0.1.evil.com",
    "not a url",
    "file:///etc/passwd",
  ])("rejects a non-loopback or malformed Ollama URL %s", (url) => {
    expect(() => devStandInConfig({ ...on, DEV_STANDIN_OLLAMA_URL: url })).toThrow(/loopback|URL/i);
  });

  it.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434"])("accepts loopback %s", (url) => {
    const config = devStandInConfig({ ...on, DEV_STANDIN_OLLAMA_URL: url });
    expect(config.enabled).toBe(true);
  });

  it("clamps the frame count to a safe range and ignores junk", () => {
    const frames = (value: string) => {
      const config = devStandInConfig({ ...on, DEV_STANDIN_FRAME_COUNT: value });
      return config.enabled ? config.frameCount : -1;
    };
    expect(frames("6")).toBe(6);
    expect(frames("999")).toBe(12);
    expect(frames("0")).toBe(6);
    expect(frames("abc")).toBe(6);
  });
});

describe("parseVlmOutput", () => {
  it("accepts a well-formed answer", () => {
    expect(parseVlmOutput(JSON.stringify(goodVlm)).grade).toBe(72);
  });

  it.each([
    ["not json", "I think the athlete is fast"],
    ["extra keys", JSON.stringify({ ...goodVlm, speedMps: 9.1 })],
    ["grade above range", JSON.stringify({ ...goodVlm, grade: 140 })],
    ["negative grade", JSON.stringify({ ...goodVlm, grade: -1 })],
    ["fractional confidence out of range", JSON.stringify({ ...goodVlm, confidence: 1.5 })],
    ["missing field", JSON.stringify({ drillShown: true })],
    ["link in text", JSON.stringify({ ...goodVlm, summary: "See https://evil.example for details" })],
    ["email in text", JSON.stringify({ ...goodVlm, issues: ["write to a@b.co"] })],
    ["overlong text", JSON.stringify({ ...goodVlm, summary: "x".repeat(2000) })],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseVlmOutput(raw)).toThrow();
  });

  it("nulls the grade when the drill is not shown", () => {
    expect(parseVlmOutput(JSON.stringify({ ...goodVlm, drillShown: false })).grade).toBeNull();
  });
});

describe("buildStandInAnalysis", () => {
  const built = () => buildStandInAnalysis({ sport: "soccer", drill: "sprint-20m", probe, vlm: parseVlmOutput(JSON.stringify(goodVlm)) });

  it("labels itself and reports zero computer-vision evidence", () => {
    const { analysis } = built();
    expect(analysis.evidence.detector).toBe(DEV_STANDIN_ENGINE);
    expect(analysis.evidence.pose_backend).toBe("none");
    expect(analysis.evidence.athlete_detected_frames).toBe(0);
    expect(analysis.evidence.calibration_method ?? null).toBeNull();
    expect(analysis.analysis.reliability.status).toBe("unavailable");
    expect(analysis.analysis.reliability.score).toBe(0);
    expect(analysis.analysis.overall_score).toBeNull();
  });

  it("uses the real probe numbers, never invented ones", () => {
    const { analysis } = built();
    expect(analysis.evidence).toMatchObject({ fps: 30, width: 1280, height: 720, duration_seconds: 4.2 });
  });

  it("can never produce a performance metric that reaches the database row", () => {
    const metrics = mapVisionAnalysisToMetrics(built().analysis);
    expect(Object.keys(metrics).sort()).toEqual(["motionTrackingScore", "reliabilityScore"]);
    expect(metrics.reliabilityScore).toBe(0);
  });

  it("never passes capture adherence", () => {
    for (const drill of ["sprint-20m", "agility-5-10-5", "cone-dribble"]) {
      const { analysis } = buildStandInAnalysis({ sport: "soccer", drill, probe, vlm: parseVlmOutput(JSON.stringify(goodVlm)) });
      expect(assessCaptureAdherence(drill, analysis.evidence).status).not.toBe("VERIFIED");
    }
  });

  it("keeps the qualitative grade only in the labelled dev report", () => {
    const { report, analysis } = built();
    expect(report).toMatchObject({ engine: DEV_STANDIN_ENGINE, validated: false, grade: 72 });
    expect(JSON.stringify(analysis)).not.toMatch(/"grade"/);
  });

  it("exposes a model version no validation record can be bound to", () => {
    expect(DEV_STANDIN_MODEL_VERSION).toMatch(/^dev-vlm-standin/);
  });
});

describe("runDevStandInAnalysis", () => {
  const deps = {
    probe: vi.fn(),
    extractFrames: vi.fn(),
    chat: vi.fn(),
  };
  const input = { videoPath: "/tmp/clip.mp4", sport: "soccer" as const, drill: "sprint-20m" };
  const config = () => {
    const resolved = devStandInConfig(on);
    if (!resolved.enabled) throw new Error("test config must be enabled");
    return resolved;
  };

  beforeEach(() => {
    deps.probe.mockReset().mockResolvedValue(probe);
    deps.extractFrames.mockReset().mockResolvedValue({ frames: ["ZmFrZTE=", "ZmFrZTI="], cleanup: vi.fn(async () => {}) });
    deps.chat.mockReset().mockResolvedValue(JSON.stringify(goodVlm));
  });

  it("sends sampled frames to the model and returns a labelled result", async () => {
    const result = await runDevStandInAnalysis(input, config(), deps);
    expect(deps.chat).toHaveBeenCalledTimes(1);
    expect(deps.chat.mock.calls[0][0]).toMatchObject({ model: "qwen2.5vl:3b", images: ["ZmFrZTE=", "ZmFrZTI="] });
    expect(result.report.validated).toBe(false);
    expect(result.analysis.analysis.reliability.status).toBe("unavailable");
  });

  it("fails closed when the model answers with garbage", async () => {
    deps.chat.mockResolvedValue("sure! the athlete ran 9.4 m/s");
    await expect(runDevStandInAnalysis(input, config(), deps)).rejects.toThrow();
  });

  it("fails closed when the model is unreachable", async () => {
    deps.chat.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    await expect(runDevStandInAnalysis(input, config(), deps)).rejects.toThrow(/stand-in/i);
  });

  it("fails closed when no frames can be extracted", async () => {
    deps.extractFrames.mockResolvedValue({ frames: [], cleanup: vi.fn(async () => {}) });
    await expect(runDevStandInAnalysis(input, config(), deps)).rejects.toThrow();
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("always cleans up temporary frames, success or failure", async () => {
    const cleanup = vi.fn(async () => {});
    deps.extractFrames.mockResolvedValue({ frames: ["ZmFrZTE="], cleanup });
    await runDevStandInAnalysis(input, config(), deps);
    deps.chat.mockRejectedValue(new Error("boom"));
    await expect(runDevStandInAnalysis(input, config(), deps)).rejects.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});

describe("dev stand-in visibility", () => {
  const report = buildStandInAnalysis({ sport: "soccer", drill: "sprint-20m", probe, vlm: parseVlmOutput(JSON.stringify(goodVlm)) }).report;

  it("is visible only when enabled outside production", () => {
    expect(devStandInVisible(on)).toBe(true);
    expect(devStandInVisible({ NODE_ENV: "development" })).toBe(false);
    expect(devStandInVisible({ ...on, NODE_ENV: "production" })).toBe(false);
    expect(devStandInVisible({ DEV_STANDIN_ANALYZER: "true", NODE_ENV: "development" })).toBe(false); // no model: misconfigured
  });

  it("reads a stored report back only if it is intact and unvalidated", () => {
    expect(readDevStandInReport({ devStandIn: report })).toEqual(report);
    expect(readDevStandInReport({})).toBeNull();
    expect(readDevStandInReport(null)).toBeNull();
    expect(readDevStandInReport({ devStandIn: { ...report, validated: true } })).toBeNull();
    expect(readDevStandInReport({ devStandIn: { ...report, engine: "athlemetry-vision-core" } })).toBeNull();
    expect(readDevStandInReport({ devStandIn: { ...report, grade: 500 } })).toBeNull();
  });
});
