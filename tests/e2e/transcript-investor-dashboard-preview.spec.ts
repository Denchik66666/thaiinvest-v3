import { expect, test } from "@playwright/test";

/** Инвестор из seed — главная как в транскрипте чата (WeekCycleStrip + плитки + amber CTA). */
const loginUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
const loginPassword = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

test("investor dashboard transcript preview screenshots", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });

  const loginRes = await context.request.post("/api/auth/login", {
    data: { username: loginUser, password: loginPassword },
  });
  if (!loginRes.ok()) {
    throw new Error(`Login failed ${loginRes.status()}: ${await loginRes.text()}`);
  }

  await page.goto("/dashboard", { waitUntil: "networkidle" });

  await expect(page.getByText("Доступно к выводу", { exact: false }).first()).toBeVisible({ timeout: 60_000 });

  await page.evaluate(() => {
    localStorage.setItem("app-dark-mode", "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/investor-transcript-light.png", fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("app-dark-mode", "true");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/investor-transcript-dark.png", fullPage: true });
});
