import { expect, test, type Browser, devices } from "@playwright/test";

/**
 * Скриншоты топбара: аватар + ник + стрелка должны быть "ghost" без подложек/фонов,
 * визуально вровень с фоном страницы (как кнопки reset/confirm в календаре).
 *
 * Вход: SUPER_ADMIN (`Den` / `admin123` по умолчанию; см. seed и `clean-data.md`).
 * PLAYWRIGHT_SUPERADMIN_USER / PLAYWRIGHT_SUPERADMIN_PASSWORD — переопределение.
 * PLAYWRIGHT_SKIP_WEBSERVER=1 — если dev уже запущен.
 */
const OUT = "screenshots/compare/2026-05-08_topbar-avatar-ghost";

async function newSuperAdminContext(browser: Browser, baseURL: string) {
  const u = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "Den";
  const p = process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ?? "admin123";
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  return ctx;
}

async function setTheme(page: import("@playwright/test").Page, mode: "dark" | "light") {
  await page.evaluate((m) => {
    localStorage.setItem("app-dark-mode", m === "dark" ? "true" : "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  }, mode);
  await page.waitForTimeout(450);
}

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
  await page.waitForURL(/\/dashboard(\/)?$/, { timeout: 120_000 });
  // Стабильная точка готовности: шапка дашборда (текст может отличаться по ролям/флагам).
  const topbar = page.locator(".thai-dashboard-sticky-bar").first();
  await expect(topbar).toBeVisible({ timeout: 120_000 });
  // На некоторых мобильных прогонах computed name может флейкать — достаточно факта, что интерактивы есть.
  await expect(topbar.locator("button").first()).toBeVisible({ timeout: 120_000 });
}

const VIEWPORTS = [
  { slug: "desktop", width: 1280, height: 900 },
  { slug: "mobile", width: 390, height: 844 },
  { slug: "s25plus", width: 412, height: 915 },
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const vp of VIEWPORTS) {
    test(`topbar avatar ghost — ${theme} (${vp.slug})`, async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const b = baseURL ?? "http://127.0.0.1:3000";
      const ctx = await newSuperAdminContext(browser, b);
      const page = await ctx.newPage();

      // На mobile хотим мобайл-метрики клика/таба, но без "как будто iPhone".
      if (vp.slug === "mobile" || vp.slug === "s25plus") {
        await page.emulateMedia({ colorScheme: theme });
      }

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openDashboard(page);
      await setTheme(page, theme);

      const topbar = page.locator(".thai-dashboard-sticky-bar").first();
      await expect(topbar).toBeVisible();

      // Небольшая пауза на анимации/перерисовку.
      await page.waitForTimeout(150);

      await topbar.screenshot({ path: `${OUT}/${theme}/${vp.slug}/topbar.png` });

      await ctx.close();
    });
  }
}

