import { expect, test, type Browser } from "@playwright/test";

/**
 * Регрессия главной инвестора (/dashboard) — полный скрин без OWNER.
 * Выход: screenshots/compare/investor-dashboard-regression/
 *
 * PLAYWRIGHT_INVESTOR_USER / PLAYWRIGHT_INVESTOR_PASSWORD — опционально (по умолчанию Sega_55RUS).
 */
const OUT = "screenshots/compare/investor-dashboard-regression";

async function newContextWithLogin(browser: Browser, baseURL: string, u: string, p: string) {
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  const me = await ctx.request.get("/api/auth/me");
  expect(me.ok()).toBeTruthy();
  const body = (await me.json()) as { user?: { role?: string } };
  expect(body.user?.role).toBe("INVESTOR");
  return ctx;
}

async function setTheme(page: import("@playwright/test").Page, dark: boolean) {
  await page.evaluate((d) => {
    localStorage.setItem("app-dark-mode", d ? "true" : "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  }, dark);
  await page.waitForTimeout(500);
}

async function gotoInvestorDashboard(page: import("@playwright/test").Page) {
  const heroSel = ".thai-investor-hero-panel";
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
    await page.waitForURL(/\/dashboard(\/)?$/, { timeout: 120_000 });
    const hero = page.locator(heroSel).first();
    try {
      await hero.waitFor({ state: "visible", timeout: 100_000 });
      break;
    } catch {
      if (attempt === 1) throw new Error(`Hero ${heroSel} not visible after reload`);
      await page.waitForTimeout(800);
    }
  }

  await expect(page.getByText("Открытая неделя").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("История операций").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Доступно к выводу").first()).toBeVisible({ timeout: 60_000 });

  await expect(
    page
      .locator(heroSel)
      .locator(".thai-dashboard-history-embedded")
      .getByTitle("С учётом периода и типа операций")
  ).toBeVisible({ timeout: 90_000 });

  await page.waitForTimeout(500);
}

test("investor /dashboard regression screenshots desktop dark+light", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const b = baseURL ?? "http://127.0.0.1:3000";
  const u = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const p = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

  const ctx = await newContextWithLogin(browser, b, u, p);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await gotoInvestorDashboard(page);
    await setTheme(page, theme === "dark");
    await gotoInvestorDashboard(page);
    await page.screenshot({ path: `${OUT}/investor-dashboard-${theme}-desktop.png`, fullPage: true });
  }

  await ctx.close();
});
