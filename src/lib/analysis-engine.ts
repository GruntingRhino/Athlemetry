import { devStandInConfig, DEV_STANDIN_ENGINE, runDevStandInAnalysis, type DevStandInReport } from "@/lib/dev-standin";
import { runVisionAnalysis, type VisionAnalysisResult } from "@/lib/vision-analysis";

export const REAL_ENGINE = "athlemetry-vision-core";

type AnalysisInput = Parameters<typeof runVisionAnalysis>[0];

export type AnalysisEngineResult =
  | { engine: typeof REAL_ENGINE; analysis: VisionAnalysisResult }
  | { engine: typeof DEV_STANDIN_ENGINE; analysis: VisionAnalysisResult; devStandIn: DevStandInReport };

/**
 * Single seam between the processing queue and an analyzer. Real
 * computer-vision analysis is the default; the dev stand-in runs only when
 * explicitly enabled outside production (see `dev-standin.ts`). A stand-in
 * failure never falls back to the real analyzer, and a misconfigured
 * production environment fails loudly instead of choosing for itself.
 */
export async function runAnalysisEngine(
  input: AnalysisInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AnalysisEngineResult> {
  const config = devStandInConfig(env);
  if (!config.enabled) {
    return { engine: REAL_ENGINE, analysis: await runVisionAnalysis(input) };
  }
  const { analysis, report } = await runDevStandInAnalysis(input, config);
  return { engine: DEV_STANDIN_ENGINE, analysis, devStandIn: report };
}
