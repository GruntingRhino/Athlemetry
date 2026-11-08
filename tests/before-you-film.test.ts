import { describe, expect, it } from "vitest";

import { getBeforeYouFilmItems } from "@/app/submissions/new/before-you-film";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

describe("getBeforeYouFilmItems wording", () => {
  it("never shows lab jargon to athletes, for any drill", () => {
    for (const slug of Object.keys(DRILL_PROTOCOLS)) {
      const text = getBeforeYouFilmItems(slug).join(" ");
      expect(text, slug).not.toMatch(/calibrat|reference plane/i);
    }
  });

  it("keeps the requirement while rewording it", () => {
    const text = getBeforeYouFilmItems("baseball-swing-timing").join(" ");
    expect(text).toMatch(/120 fps/);
    expect(text).toMatch(/whole bat/i);
  });

  it("is empty for an unknown drill instead of inventing requirements", () => {
    expect(getBeforeYouFilmItems("not-a-drill")).toEqual([]);
  });
});
