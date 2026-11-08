import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyDraft,
  createInitialValues,
  getDrillsForSport,
  getOptionalFieldsForDrill,
  getSportsWithDrills,
  parseUploadDraft,
  resolveInitialSelection,
  toDatetimeLocalValue,
  type FlowDrill,
} from "@/app/submissions/new/upload-flow";
import { STANDARD_DRILLS } from "@/lib/constants";

const drills: FlowDrill[] = STANDARD_DRILLS.map((drill) => ({
  id: `id-${drill.slug}`,
  name: drill.name,
  slug: drill.slug,
  sport: drill.sport,
  guidelines: drill.guidelines,
}));

describe("resolveInitialSelection", () => {
  it("never preselects a sport or drill when no params are given", () => {
    expect(resolveInitialSelection(drills, {})).toEqual({ sport: null, drillId: "" });
    expect(resolveInitialSelection(drills, { sport: null, drill: null })).toEqual({ sport: null, drillId: "" });
  });

  it("does not fall back to soccer or baseball for unknown values", () => {
    expect(resolveInitialSelection(drills, { sport: "cricket", drill: "nope" })).toEqual({ sport: null, drillId: "" });
    expect(resolveInitialSelection(drills, { sport: "" })).toEqual({ sport: null, drillId: "" });
  });

  it("preselects the sport from ?sport= without choosing a drill", () => {
    expect(resolveInitialSelection(drills, { sport: "basketball" })).toEqual({ sport: "basketball", drillId: "" });
  });

  it("selects the drill and its sport from ?drill=<slug>, and the drill wins over a conflicting sport", () => {
    expect(resolveInitialSelection(drills, { drill: "agility-5-10-5" })).toEqual({
      sport: "soccer",
      drillId: "id-agility-5-10-5",
    });
    expect(resolveInitialSelection(drills, { sport: "soccer", drill: "baseball-pitch-command" })).toEqual({
      sport: "baseball",
      drillId: "id-baseball-pitch-command",
    });
  });
});

describe("drill grouping by sport", () => {
  it("returns only the chosen sport's drills and none without a sport", () => {
    expect(getDrillsForSport(drills, null)).toEqual([]);
    const basketball = getDrillsForSport(drills, "basketball");
    expect(basketball.length).toBeGreaterThan(0);
    expect(basketball.every((drill) => drill.sport === "basketball")).toBe(true);
  });

  it("lists only sports that have drills, in canonical order", () => {
    expect(getSportsWithDrills(drills)).toEqual(["soccer", "baseball", "basketball"]);
    expect(getSportsWithDrills(drills.filter((drill) => drill.sport !== "baseball"))).toEqual(["soccer", "basketball"]);
    expect(getSportsWithDrills([])).toEqual([]);
  });
});

describe("getOptionalFieldsForDrill", () => {
  it("shows the baseball league preset only for baseball drills", () => {
    expect(getOptionalFieldsForDrill({ slug: "baseball-pitch-command", sport: "baseball" }).baseballLeague).toBe(true);
    expect(getOptionalFieldsForDrill({ slug: "sprint-20m", sport: "soccer" }).baseballLeague).toBe(false);
    expect(getOptionalFieldsForDrill({ slug: "basketball-free-throw", sport: "basketball" }).baseballLeague).toBe(false);
  });

  it("hides every drill-specific field until a drill is chosen", () => {
    expect(getOptionalFieldsForDrill(undefined)).toMatchObject({ baseballLeague: false, distance: false });
    expect(getOptionalFieldsForDrill({ slug: "sprint-20m", sport: "soccer" }).distance).toBe(true);
  });
});

describe("initial values and recording date", () => {
  it("starts empty when nothing is selected", () => {
    const values = createInitialValues(drills, { sport: null, drillId: "" });
    expect(values.sport).toBeNull();
    expect(values.drillId).toBe("");
    expect(values.recordingDate).toBe("");
  });

  it("uses the drill's capture defaults", () => {
    const values = createInitialValues(drills, { sport: "baseball", drillId: "id-baseball-pitch-command" });
    expect(values.cameraAngle).toBe("behind-catcher");
    expect(values.distanceFeet).toBe(60.5);
  });

  it("formats local time for datetime-local inputs", () => {
    expect(toDatetimeLocalValue(new Date(2026, 10, 8, 7, 5))).toBe("2026-11-08T07:05");
  });
});

describe("draft persistence", () => {
  const initial = createInitialValues(drills, { sport: null, drillId: "" });

  it("ignores missing, malformed, or non-object drafts", () => {
    expect(parseUploadDraft(null, drills)).toBeNull();
    expect(parseUploadDraft("not json", drills)).toBeNull();
    expect(parseUploadDraft("[1,2]", drills)).toBeNull();
    expect(parseUploadDraft("42", drills)).toBeNull();
  });

  it("round-trips a valid draft", () => {
    const draft = {
      ...createInitialValues(drills, { sport: "soccer", drillId: "id-sprint-20m" }),
      recordingDate: "2026-11-08T09:30",
      location: "North field",
      notes: "Windy day, second attempt",
    };
    expect(parseUploadDraft(JSON.stringify(draft), drills)).toEqual(draft);
  });

  it("drops unknown options, oversized text, bad distances, and mismatched drills", () => {
    const parsed = parseUploadDraft(
      JSON.stringify({
        sport: "baseball",
        drillId: "id-sprint-20m",
        recordingDate: "yesterday",
        location: "x".repeat(81),
        notes: "y".repeat(501),
        cameraAngle: "<script>",
        clipQuality: "legendary",
        baseballLeague: "made-up",
        reviewRetentionDays: "9999",
        distanceFeet: -5,
      }),
      drills,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.sport).toBe("baseball");
    expect(parsed?.drillId).toBe("");
    expect(parsed?.recordingDate).toBe("");
    expect(parsed?.location).toBe("");
    expect(parsed?.notes).toBe("");
    expect(parsed?.cameraAngle).not.toBe("<script>");
    expect(parsed?.clipQuality).toBe("good");
    expect(parsed?.baseballLeague).toBe("regulation-60-5");
    expect(parsed?.reviewRetentionDays).toBe("0");
    expect(parsed?.distanceFeet).toBeGreaterThan(0);
  });

  it("restores the stored selection when the URL gives none", () => {
    const draft = createInitialValues(drills, { sport: "basketball", drillId: "id-basketball-free-throw" });
    expect(applyDraft(initial, draft)).toMatchObject({ sport: "basketball", drillId: "id-basketball-free-throw" });
    expect(applyDraft(initial, null)).toBe(initial);
  });

  it("lets the URL selection win and keeps drill details only for the same drill", () => {
    const fromUrl = createInitialValues(drills, { sport: "soccer", drillId: "id-sprint-20m" });
    const otherDrillDraft = {
      ...createInitialValues(drills, { sport: "baseball", drillId: "id-baseball-pitch-command" }),
      location: "Cage 2",
      frameRate: "120",
    };
    const merged = applyDraft(fromUrl, otherDrillDraft);
    expect(merged.sport).toBe("soccer");
    expect(merged.drillId).toBe("id-sprint-20m");
    expect(merged.location).toBe("Cage 2");
    expect(merged.frameRate).toBe("");
    expect(merged.distanceFeet).toBe(fromUrl.distanceFeet);

    const sameDrillDraft = { ...fromUrl, frameRate: "60" };
    expect(applyDraft(fromUrl, sameDrillDraft).frameRate).toBe("60");
  });
});

describe("upload form source contract", () => {
  const source = readFileSync("src/components/forms/upload-form.tsx", "utf8");

  it("keeps posting every field the submissions API expects", () => {
    for (const name of [
      "drillDefinitionId",
      "recordingDate",
      "location",
      "frameRate",
      "startFrame",
      "finishFrame",
      "repetitionHint",
      "cameraAngle",
      "athleteHandedness",
      "clipQuality",
      "measurementDistanceFeet",
      "baseballLeague",
      "notes",
      "reviewRetentionDays",
      "video",
    ]) {
      expect(source).toContain(`name="${name}"`);
    }
    expect(source).toContain('formData.set("drillType", selectedDrill.slug)');
  });

  it("does not invite unverifiable numbers in the notes placeholder", () => {
    expect(source).toContain('placeholder="Windy day, second attempt"');
    expect(source).not.toMatch(/radar|mph/i);
  });

  it("explains what happens after submit without overpromising", () => {
    expect(source).toContain("What happens next: we upload your clip, analyze it, and show you a result here.");
    expect(source).toContain("Some drills are still in research mode");
  });

  it("puts the file picker and camera before the optional details", () => {
    expect(source.indexOf('name="video"')).toBeLessThan(source.indexOf("Optional details (improves analysis)"));
    expect(source.indexOf("<BrowserCameraRecorder")).toBeLessThan(source.indexOf("Optional details (improves analysis)"));
  });

  it("guards sessionStorage access", () => {
    expect(source).toMatch(/try \{[\s\S]*sessionStorage\.getItem/);
    expect(source).toMatch(/try \{[\s\S]*sessionStorage\.setItem/);
  });
});
