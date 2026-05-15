import { expect, test } from "@playwright/test";

/**
 * Полноэкранные скриншоты главной /dashboard в тёмной теме для трёх ролей (после prisma db seed).
 * Файлы: screenshots/dashboard-super-admin.png, dashboard-owner.png, dashboard-investor.png
 *
 * При уже запущенном dev:
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; $env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3000"; npx playwright test tests/e2e/dashboard-three-roles-dark.spec.ts
 */
const SESSIONS = [
  { file: "dashboard-super-admin", username: "Den", password: "admin123" },
  { file: "dashboard-owner", username: "Sam", password: "admin123" },
  { file: "dashboard-investor", username: "Sega_55RUS", password: "qwerty123" },
] as const;

for (const { file, username, password } of SESSIONS) {
  test(`главная тёмная тема — ${username} → screenshots/${file}.png`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    const loginRes = await ctx.request.post("/api/auth/login", {
      data: { username, password },
    });
    if (!loginRes.ok()) {
      const body = await loginRes.text();
      throw new Error(`Login failed ${username} ${loginRes.status()}: ${body}`);
    }

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Главная" })).toBeVisible({ timeout: 30_000 });

    await page.evaluate(() => {
      localStorage.setItem("app-dark-mode", "true");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/${file}.png`, fullPage: true });
    await ctx.close();
  });
}
