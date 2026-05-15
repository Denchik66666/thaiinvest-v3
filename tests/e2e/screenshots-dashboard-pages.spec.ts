import { expect, test } from "@playwright/test";

/**
 * Скриншоты страниц дашборда → screenshots/
 * Учётные данные: Den / admin123 (или PLAYWRIGHT_LOGIN_*).
 *
 * При уже запущенном dev:
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; $env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3000"; npx playwright test tests/e2e/screenshots-dashboard-pages.spec.ts
 */
const loginUser = process.env.PLAYWRIGHT_LOGIN_USER ?? "Den";
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";

test("dashboard pages screenshots", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  async function setTheme(dark: boolean) {
    await page.evaluate((d) => {
      localStorage.setItem("app-dark-mode", d ? "true" : "false");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    }, dark);
    await page.waitForTimeout(450);
  }

  async function shot(name: string) {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  const loginRes = await context.request.post("/api/auth/login", {
    data: { username: loginUser, password: loginPassword },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`Login failed ${loginRes.status()}: ${body}`);
  }

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible({ timeout: 60_000 });
  await setTheme(true);
  await shot("dashboard-dark");
  await setTheme(false);
  await shot("dashboard-light");

  await page.goto("/dashboard/investors", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Список позиций" })).toBeVisible({ timeout: 60_000 });
  await setTheme(true);
  await shot("investors-dark");

  await page.goto("/dashboard/manage", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Создать инвестора" })).toBeVisible({ timeout: 60_000 });
  await setTheme(true);
  await shot("manage-dark");

  await page.goto("/dashboard/profile", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Безопасность" })).toBeVisible({ timeout: 30_000 });
  await setTheme(true);
  await shot("profile-dark");
});
