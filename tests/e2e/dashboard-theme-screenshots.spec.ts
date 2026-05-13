import { expect, test } from "@playwright/test";

/**
 * Скриншоты /dashboard в тёмной и светлой теме.
 * Логин через API (httpOnly cookie), затем открытие дашборда.
 *
 * Учётные данные: PLAYWRIGHT_LOGIN_USER / PLAYWRIGHT_LOGIN_PASSWORD
 * или по умолчанию Sam / admin123 (prisma/seed.ts).
 *
 * Запуск при уже запущенном dev на :3000:
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; npx playwright test tests/e2e/dashboard-theme-screenshots.spec.ts
 */
const loginUser = process.env.PLAYWRIGHT_LOGIN_USER ?? "Sam";
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";

test.describe("Dashboard design preview", () => {
  test("capture dashboard dark and light", async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    const loginRes = await context.request.post("/api/auth/login", {
      data: { username: loginUser, password: loginPassword },
    });
    if (!loginRes.ok()) {
      const body = await loginRes.text();
      throw new Error(`Login failed ${loginRes.status()}: ${body}`);
    }

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible({ timeout: 30_000 });

    await page.evaluate(() => {
      localStorage.setItem("app-dark-mode", "true");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/dashboard-demo-dark.png", fullPage: true });

    await page.evaluate(() => {
      localStorage.setItem("app-dark-mode", "false");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/dashboard-demo-light.png", fullPage: true });
  });
});
