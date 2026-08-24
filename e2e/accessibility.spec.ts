import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/privacy-notice",
  "/terms",
  "/drills",
  "/protocols",
] as const;

for (const route of publicRoutes) {
  test(`${route} has no automatically detectable serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
  });
}
