import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { verifiedOutcomeEvidence } from "@/lib/outcome-evidence";

describe("verified outcome evidence", () => {
  it("rejects bare metadata counts even when they are named verifiedOutcomes", () => {
    expect(verifiedOutcomeEvidence({
      verifiedOutcomes: { attempts: 10, successes: 10 },
    })).toBeUndefined();
  });

  it("accepts bounded counts only with independent two-reviewer evidence", () => {
    expect(verifiedOutcomeEvidence({
      verifiedOutcomes: {
        source: "independent-outcome-review-v1",
        status: "VERIFIED",
        attempts: 10,
        successes: 6,
        reviewedBy: ["reviewer-1", "reviewer-2"],
        evidenceUri: "https://evidence.example.test/studies/outcomes-1",
      },
    })).toEqual({ attempts: 10, successes: 6 });
  });

  it("rejects invalid counts, duplicate reviewers, and non-HTTPS evidence", () => {
    const base = {
      source: "independent-outcome-review-v1",
      status: "VERIFIED",
      attempts: 10,
      successes: 6,
      reviewedBy: ["reviewer-1", "reviewer-2"],
      evidenceUri: "https://evidence.example.test/studies/outcomes-1",
    };
    expect(verifiedOutcomeEvidence({ verifiedOutcomes: { ...base, successes: 11 } })).toBeUndefined();
    expect(verifiedOutcomeEvidence({ verifiedOutcomes: { ...base, reviewedBy: ["reviewer-1", "reviewer-1"] } })).toBeUndefined();
    expect(verifiedOutcomeEvidence({ verifiedOutcomes: { ...base, evidenceUri: "http://evidence.example.test/outcomes" } })).toBeUndefined();
  });

  it("clears legacy accuracy values and unproven outcome metadata during migration", () => {
    const sql = readFileSync(
      "prisma/migrations/20260727201500_invalidate_unproven_accuracy_evidence/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(/SET "accuracyScore" = NULL/);
    expect(sql).toMatch(/metadata\s*=\s*metadata\s*-\s*'verifiedOutcomes'/);
  });
});
