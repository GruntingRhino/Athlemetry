import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyDraft,
  createInitialValues,
  describeUploadProgress,
  distanceToPostedFeet,
  getDistanceLabel,
  getDistanceUnit,
  isDetailField,
  listUploadErrors,
  parseDistanceInput,
  QUEUED_CONFIRMATION,
  validateUploadValues,
  getDrillsForSport,
  getOptionalFieldsForDrill,
  getSportsWithDrills,
  parseUploadDraft,
  resolveInitialSelection,
  toDatetimeLocalValue,
  type FlowDrill,
} from "@/app/submissions/new/upload-flow";
import { getBeforeYouFilmItems } from "@/app/submissions/new/before-you-film";
import { STANDARD_DRILLS } from "@/lib/constants";
import { getDrillCaptureProfile } from "@/lib/drill-capture";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

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

  it("pre-selects no optional answer, even for a chosen drill", () => {
    const values = createInitialValues(drills, { sport: "baseball", drillId: "id-baseball-pitch-command" });
    expect(values.drillId).toBe("id-baseball-pitch-command");
    expect(values).toMatchObject({ cameraAngle: "", athleteHandedness: "", clipQuality: "", distance: "", baseballLeague: "" });
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
        distance: "-5; drop table",
      }),
      drills,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.sport).toBe("baseball");
    expect(parsed?.drillId).toBe("");
    expect(parsed?.recordingDate).toBe("");
    expect(parsed?.location).toBe("");
    expect(parsed?.notes).toBe("");
    expect(parsed?.cameraAngle).toBe("");
    expect(parsed?.clipQuality).toBe("");
    expect(parsed?.baseballLeague).toBe("");
    expect(parsed?.reviewRetentionDays).toBe("0");
    expect(parsed?.distance).toBe("");
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
    expect(merged.distance).toBe(fromUrl.distance);

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
      "baseballLeague",
      "notes",
      "reviewRetentionDays",
      "video",
    ]) {
      expect(source).toContain(`name="${name}"`);
    }
    expect(source).toContain('formData.set("drillType", selectedDrill.slug)');
    // Posted in feet (converted from the unit shown) and only when the user typed a distance.
    expect(source).toContain('formData.set("measurementDistanceFeet"');
  });

  it("lets the form validate itself and keeps untouched fields from blocking submit", () => {
    expect(source).toContain("noValidate");
    expect(source).not.toMatch(/\srequired=\{/);
    expect(source).not.toMatch(/^\s+required\s*$/m);
    expect(source).not.toMatch(/type="range"|step=/);
  });

  it("does not use a colored side border or pre-selected defaults", () => {
    expect(source).not.toMatch(/border-[lr]-[2-9]/);
    expect(source).not.toMatch(/defaultValue|defaultChecked/);
  });

  it("does not invite unverifiable numbers in the notes placeholder", () => {
    expect(source).toContain('placeholder="Windy day, second attempt"');
    expect(source).not.toMatch(/radar|mph/i);
  });

  it("explains what happens after submit without overpromising", () => {
    expect(source).toContain("What happens next: we upload your clip, analyze it, and show you a result here.");
    expect(source).toContain("we can&apos;t yet confirm a measurement is accurate enough to show");
    expect(source).not.toMatch(/Submission queued|research mode|release gate/i);
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


describe("measurement distance", () => {
  it("shows metres exactly for the drills whose lane is a whole number of metres", () => {
    for (const drill of STANDARD_DRILLS) {
      const feet = getDrillCaptureProfile({ slug: drill.slug, sport: drill.sport }).measurementDistanceFeet;
      const metres = feet * 0.3048;
      const isWholeMetres = Math.abs(metres - Math.round(metres)) < 0.05;
      expect(getDistanceUnit(drill), drill.slug).toBe(isWholeMetres ? "m" : "ft");
    }
    expect(getDistanceUnit({ slug: "sprint-20m" })).toBe("m");
    expect(getDistanceUnit({ slug: "basketball-free-throw" })).toBe("ft");
    expect(getDistanceUnit(undefined)).toBe("ft");
  });

  it("converts metres to the feet the API field expects and leaves feet alone", () => {
    expect(distanceToPostedFeet("20", "m")).toBe(65.62);
    expect(distanceToPostedFeet("5,5", "m")).toBe(18.04);
    expect(distanceToPostedFeet("15", "ft")).toBe(15);
    expect(distanceToPostedFeet(" 60.5 ", "ft")).toBe(60.5);
  });

  it("posts nothing for blank, non-numeric, zero, or negative input", () => {
    for (const raw of ["", "   ", "abc", "0", "-3", "1e999", "1.2.3"]) {
      expect(parseDistanceInput(raw), raw).toBeNull();
      expect(distanceToPostedFeet(raw, "ft"), raw).toBeNull();
    }
  });

  it("labels the field in the unit shown", () => {
    expect(getDistanceLabel({ slug: "sprint-20m", sport: "soccer" })).toBe("Sprint distance (metres)");
    expect(getDistanceLabel({ slug: "basketball-free-throw", sport: "basketball" })).toBe("Free-throw line distance (feet)");
  });
});

describe("validateUploadValues", () => {
  const complete = {
    ...createInitialValues(drills, { sport: "soccer", drillId: "id-sprint-20m" }),
    recordingDate: "2026-11-08T09:30",
    location: "North field",
  };
  const ok = { hasVideo: true, unit: "m" as const };

  it("accepts an untouched form once the essentials are filled (nothing optional can block)", () => {
    expect(validateUploadValues(complete, ok)).toEqual({});
  });

  it("asks for the sport first, then the drill, before anything else", () => {
    const none = createInitialValues(drills, { sport: null, drillId: "" });
    expect(validateUploadValues(none, ok)).toEqual({ sport: "Choose a sport." });
    const noDrill = createInitialValues(drills, { sport: "soccer", drillId: "" });
    expect(validateUploadValues(noDrill, ok)).toEqual({ drillId: "Choose a drill." });
  });

  it("flags each missing essential with its own message, in page order", () => {
    const errors = validateUploadValues({ ...complete, recordingDate: "", location: " x " }, { hasVideo: false, unit: "m" });
    expect(listUploadErrors(errors).map((item) => item.key)).toEqual(["video", "recordingDate", "location"]);
    expect(Object.values(errors).every((message) => message.length > 10)).toBe(true);
    expect(validateUploadValues({ ...complete, recordingDate: "not a date" }, ok).recordingDate).toBeTruthy();
  });

  it("mirrors the server's rules for optional numbers, but only when something was typed", () => {
    const errors = validateUploadValues(
      { ...complete, frameRate: "9", repetitionHint: "1.5", startFrame: "-1", finishFrame: "x", distance: "abc" },
      ok,
    );
    expect(Object.keys(errors).sort()).toEqual(["distance", "finishFrame", "frameRate", "repetitionHint", "startFrame"]);
    expect(validateUploadValues({ ...complete, frameRate: "240", repetitionHint: "0", startFrame: "0", finishFrame: "1" }, ok)).toEqual({});
    expect(validateUploadValues({ ...complete, startFrame: "10", finishFrame: "10" }, ok).finishFrame).toMatch(/after the start frame/);
    expect(validateUploadValues({ ...complete, startFrame: "10", finishFrame: "11" }, ok)).toEqual({});
  });

  it("rejects a distance the API would (over 200 ft), after converting the unit", () => {
    expect(validateUploadValues({ ...complete, distance: "61" }, { hasVideo: true, unit: "m" }).distance).toMatch(/too large/);
    expect(validateUploadValues({ ...complete, distance: "60" }, { hasVideo: true, unit: "m" })).toEqual({});
    expect(validateUploadValues({ ...complete, distance: "201" }, { hasVideo: true, unit: "ft" }).distance).toMatch(/too large/);
  });

  it("knows which fields live inside Optional details, so a failed submit only opens it when needed", () => {
    for (const key of ["frameRate", "repetitionHint", "startFrame", "finishFrame", "distance"] as const) expect(isDetailField(key)).toBe(true);
    for (const key of ["sport", "drillId", "video", "recordingDate", "location"] as const) expect(isDetailField(key)).toBe(false);
    const essentialsOnly = validateUploadValues({ ...complete, location: "" }, ok);
    expect(Object.keys(essentialsOnly).some((key) => isDetailField(key as never))).toBe(false);
  });
});

describe("progress and confirmation wording", () => {
  it("labels progress with a percent and announces only phases", () => {
    expect(describeUploadProgress(42)).toEqual({ visible: "Uploading your clip: 42%", announcement: "Uploading your clip." });
    expect(describeUploadProgress(100).visible).toMatch(/finished/);
    expect(describeUploadProgress(-5).visible).toContain("0%");
  });

  it("confirms the upload without a raw id or a made-up timeframe", () => {
    const text = `${QUEUED_CONFIRMATION.heading} ${QUEUED_CONFIRMATION.body}`;
    expect(text).toContain("your clip is uploaded");
    expect(text).toContain("You can close this page");
    expect(text).toContain("under Submissions");
    expect(text).not.toMatch(/queued:|minutes|\bID\b/i);
  });
});

describe("getBeforeYouFilmItems", () => {
  it("states the protocol's real frame rate, views, and what must stay in frame", () => {
    for (const drill of STANDARD_DRILLS) {
      const protocol = DRILL_PROTOCOLS[drill.slug as keyof typeof DRILL_PROTOCOLS];
      const items = getBeforeYouFilmItems(drill.slug);
      expect(items.length, drill.slug).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(3);
      expect(items[0], drill.slug).toContain(`${protocol.camera.minimumFps} fps`);
      expect(items.join(" ")).toContain(protocol.camera.referenceInFrame);
    }
    expect(getBeforeYouFilmItems("baseball-pitch-velocity")[0]).toContain("120 fps");
    expect(getBeforeYouFilmItems("sprint-20m")[0]).toContain("60 fps");
    expect(getBeforeYouFilmItems("basketball-free-throw")[1]).toBe("Film from diagonal view.");
  });

  it("invents nothing for a drill without a protocol", () => {
    expect(getBeforeYouFilmItems("no-such-drill")).toEqual([]);
  });
});
