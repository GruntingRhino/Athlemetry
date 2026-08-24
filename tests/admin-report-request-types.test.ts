import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

describe("admin report request types", () => {
  it("renders reprocessing requests distinctly for administrator review", async () => {
    const source = await readFile(path.join(root, "src/app/admin/reports/page.tsx"), "utf8");

    expect(source).toContain('report.requestType === "REPROCESS"');
    expect(source).toContain("Reprocessing request");
    expect(source).toContain("ReportReviewForm");
  });
});
