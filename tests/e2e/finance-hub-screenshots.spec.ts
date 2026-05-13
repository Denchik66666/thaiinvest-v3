import { expect, test, type Browser } from "@playwright/test";

/**
 * Только раздел «Финансы» — скриншоты для сравнения OWNER/SUPER_ADMIN vs INVESTOR.
 * Выход: screenshots/compare/finance-hub-smoke/
 */
const OUT = "screenshots/compare/finance-hub-smoke";

async function newBrowserContextWithManagerSession(browser: Browser, baseURL: string) {
  /** Сначала OWNER — лента «История операций»; SUPER_ADMIN видит предупреждение без API ленты. */
  const candidates = process.env.PLAYWRIGHT_LOGIN_USER
    ? [{ u: process.env.PLAYWRIGHT_LOGIN_USER, p: process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123" }]
    : [
        { u: "Sam", p: "admin123" },
        { u: "admin", p: "admin123" },
      ];
  for (const { u, p } of candidates) {
    const ctx = await browser.newContext({ baseURL });
    const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
    if (!loginRes.ok()) {
      await ctx.close();
      continue;
    }
    const me = await ctx.request.get("/api/auth/me");
    if (!me.ok()) {
      await ctx.close();
      continue;
    }
    const body = (await me.json()) as { user?: { role?: string } };
    const role = body.user?.role;
    if (role === "OWNER" || role === "SUPER_ADMIN") return ctx;
    await ctx.close();
  }
  throw new Error("Нужен вход OWNER/SUPER_ADMIN (Sam/admin + пароль из seed).");
}

async function newBrowserContextWithInvestorSession(browser: Browser, baseURL: string) {
  const u = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const p = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  const me = await ctx.request.get("/api/auth/me");
  expect(me.ok()).toBeTruthy();
  const body = (await me.json()) as { user?: { role?: string } };
  expect(body.user?.role).toBe("INVESTOR");
  return ctx;
}

test("finance hub screenshots owner + investor dark/light", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  async function setTheme(page: import("@playwright/test").Page, dark: boolean) {
    await page.evaluate((d) => {
      localStorage.setItem("app-dark-mode", d ? "true" : "false");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    }, dark);
    await page.waitForTimeout(400);
  }

  const mgrContext = await newBrowserContextWithManagerSession(browser, b);
  const mgrPage = await mgrContext.newPage();
  await mgrPage.setViewportSize({ width: 1280, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await mgrPage.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
    await setTheme(mgrPage, theme === "dark");
    await mgrPage.reload({ waitUntil: "load" });
    await mgrPage.waitForTimeout(500);
    // Стабильный якорь: кнопка периода в ленте (текст "История операций" может меняться).
    await expect(mgrPage.getByRole("button", { name: /^Период/i }).first()).toBeVisible({ timeout: 90_000 });
    await mgrPage.screenshot({ path: `${OUT}/finance-hub-manager-${theme}.png`, fullPage: true });
  }
  await mgrContext.close();

  const invContext = await newBrowserContextWithInvestorSession(browser, b);
  const invPage = await invContext.newPage();
  await invPage.setViewportSize({ width: 1280, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await invPage.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
    await setTheme(invPage, theme === "dark");
    await invPage.reload({ waitUntil: "load" });
    await invPage.waitForTimeout(500);
    await expect(invPage.getByRole("button", { name: /^Период/i }).first()).toBeVisible({ timeout: 90_000 });
    await invPage.screenshot({ path: `${OUT}/finance-hub-investor-${theme}.png`, fullPage: true });
  }
  await invContext.close();
});
