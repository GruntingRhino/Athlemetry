import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PRODUCT_NOTICE_EFFECTIVE_DATE, PRODUCT_NOTICES } from "@/lib/product-notices";

describe("versioned product notices", () => {
  it("uses deterministic version and effective-date metadata", () => {
    expect(PRODUCT_NOTICE_EFFECTIVE_DATE).toBe("2026-07-30");
    expect(PRODUCT_NOTICES.privacy.version).toBe("2026-07-30.1");
    expect(PRODUCT_NOTICES.terms.version).toBe("2026-07-30.1");
    expect(PRODUCT_NOTICES.privacy.effectiveDate).toBe(PRODUCT_NOTICE_EFFECTIVE_DATE);
    expect(PRODUCT_NOTICES.terms.effectiveDate).toBe(PRODUCT_NOTICE_EFFECTIVE_DATE);
  });

  it("plainly limits product claims and keeps evidence-dependent capabilities open", () => {
    const privacy = PRODUCT_NOTICES.privacy.sections.flatMap((section) => section.paragraphs).join(" ");
    const terms = PRODUCT_NOTICES.terms.sections.flatMap((section) => section.paragraphs).join(" ");

    expect(privacy).toContain("not a deployment or regulatory compliance certification");
    expect(privacy).toContain("not verified guardian identity");
    expect(privacy).toContain("not establish model accuracy");
    expect(terms).toContain("not legal advice");
    expect(terms).toContain("not a legal review");
  });

  it("publishes the routes and links them from registration, auth, and settings surfaces", () => {
    for (const path of ["src/app/privacy-notice/page.tsx", "src/app/terms/page.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("ProductNoticePage");
    }

    const registerForm = readFileSync("src/components/forms/register-form.tsx", "utf8");
    const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
    const settings = readFileSync("src/lib/sport-navigation.ts", "utf8");
    const privacyPage = readFileSync("src/app/privacy/page.tsx", "utf8");

    for (const source of [registerForm, loginPage, settings, privacyPage]) {
      expect(source).toContain('"/privacy-notice"');
      expect(source).toContain('"/terms"');
    }
  });
});
