import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runVisionAnalysis: vi.fn(),
  runDevStandInAnalysis: vi.fn(),
}));

vi.mock("@/lib/vision-analysis", () => ({ runVisionAnalysis: mocks.runVisionAnalysis }));
vi.mock("@/lib/dev-standin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dev-standin")>()),
  runDevStandInAnalysis: mocks.runDevStandInAnalysis,
}));

const { runAnalysisEngine, REAL_ENGINE } = await import("@/lib/analysis-engine");

const input = { videoPath: "/tmp/c.mp4", sport: "soccer" as const, drill: "sprint-20m" };
const real = { evidence: { fps: 60 }, analysis: {} };

describe("runAnalysisEngine", () => {
  beforeEach(() => {
    mocks.runVisionAnalysis.mockReset().mockResolvedValue(real);
    mocks.runDevStandInAnalysis.mockReset().mockResolvedValue({ analysis: { evidence: { fps: 30 } }, report: { engine: "dev-vlm-standin", validated: false } });
  });

  it("uses the real computer-vision analyzer by default", async () => {
    const result = await runAnalysisEngine(input, { NODE_ENV: "development" });
    expect(result).toEqual({ engine: REAL_ENGINE, analysis: real });
    expect(mocks.runDevStandInAnalysis).not.toHaveBeenCalled();
  });

  it("uses the stand-in only when explicitly enabled outside production", async () => {
    const result = await runAnalysisEngine(input, { DEV_STANDIN_ANALYZER: "true", DEV_STANDIN_MODEL: "qwen2.5vl:3b", NODE_ENV: "development" });
    expect(result).toMatchObject({ engine: "dev-vlm-standin", devStandIn: { validated: false } });
    expect(mocks.runVisionAnalysis).not.toHaveBeenCalled();
  });

  it("in production with the flag set, throws and never falls back to either analyzer", async () => {
    await expect(
      runAnalysisEngine(input, { DEV_STANDIN_ANALYZER: "true", DEV_STANDIN_MODEL: "m", NODE_ENV: "production" }),
    ).rejects.toThrow(/production/i);
    expect(mocks.runVisionAnalysis).not.toHaveBeenCalled();
    expect(mocks.runDevStandInAnalysis).not.toHaveBeenCalled();
  });

  it("does not silently fall back to the real analyzer when the stand-in fails", async () => {
    mocks.runDevStandInAnalysis.mockRejectedValue(new Error("Dev stand-in analyzer failed: down"));
    await expect(
      runAnalysisEngine(input, { DEV_STANDIN_ANALYZER: "true", DEV_STANDIN_MODEL: "m", NODE_ENV: "development" }),
    ).rejects.toThrow(/stand-in/i);
    expect(mocks.runVisionAnalysis).not.toHaveBeenCalled();
  });
});
