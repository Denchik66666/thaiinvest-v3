import { expect, test } from "@playwright/test";

/**
 * Превью ключевых страниц в тёмной и светлой теме → test-results/ui-*.png
 *
 * $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; npx playwright test tests/e2e/ui-pages-theme-preview.spec.ts
 */
const loginUser = process.env.PLAYWRIGHT_LOGIN_USER ?? "semen";
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";

test.describe("UI pages theme preview", () => {
  test("capture login, dashboard, manage, investors, profile", async ({ page, context }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    async function setTheme(dark: boolean) {
      await page.evaluate((d) => {
        localStorage.setItem("app-dark-mode", d ? "true" : "false");
        window.dispatchEvent(new Event("thaiinvest-theme-storage"));
      }, dark);
      await page.waitForTimeout(450);
    }

    async function shot(slug: string) {
      await page.screenshot({ path: `test-results/ui-${slug}.png`, fullPage: true });
    }

    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /Войти/i })).toBeVisible({ timeout: 30_000 });
    await setTheme(true);
    await shot("login-dark");
    await setTheme(false);
    await shot("login-light");

    const loginRes = await context.request.post("/api/auth/login", {
      data: { username: loginUser, password: loginPassword },
    });
    if (!loginRes.ok()) {
      const body = await loginRes.text();
      throw new Error(`Login failed ${loginRes.status()}: ${body}`);
    }

    /* domcontentloaded: на дашборде networkidle часто не наступает из‑за polling */
    await page.goto("/dashboard/profile", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Безопасность" })).toBeVisible({ timeout: 15_000 });
    await setTheme(true);
    await shot("profile-dark");
    await setTheme(false);
    await shot("profile-light");

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible({ timeout: 30_000 });
    await setTheme(true);
    await shot("dashboard-dark");
    await setTheme(false);
    await shot("dashboard-light");

    await page.goto("/dashboard/manage", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Создать инвестора" })).toBeVisible({ timeout: 30_000 });
    await setTheme(true);
    await shot("manage-dark");
    await setTheme(false);
    await shot("manage-light");

    await page.goto("/dashboard/investors", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Список позиций" })).toBeVisible({ timeout: 30_000 });
    await setTheme(true);
    await shot("investors-dark");
    await setTheme(false);
    await shot("investors-light");
  });
});
