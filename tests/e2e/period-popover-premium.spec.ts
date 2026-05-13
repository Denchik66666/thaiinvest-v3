import { expect, test, type Browser } from "@playwright/test";

/**
 * Скриншот открытого поповера периода (премиум-компакт).
 * Цель: быстро показать пользователю, как выглядит календарь выбора периода.
 *
 * PLAYWRIGHT_SKIP_WEBSERVER=1 — если dev уже запущен.
 */
const OUT = "screenshots/compare/2026-05-08_period-popover-premium";

async function newInvestorContext(browser: Browser, baseURL: string) {
  const u = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const p = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  return ctx;
}

async function setDarkTheme(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    localStorage.setItem("app-dark-mode", "true");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  });
  await page.waitForTimeout(400);
}

async function openPeriodPopover(page: import("@playwright/test").Page) {
  await page.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
  await page.waitForURL(/\/dashboard(\/)?$/, { timeout: 120_000 });
  await expect(page.getByText("История операций").first()).toBeVisible({ timeout: 120_000 });
  await setDarkTheme(page);

  // Кнопка периода в embedded истории операций (инвесторский эталон).
  const periodBtn = page.getByRole("button", { name: /^Период/i }).first();
  await periodBtn.click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: /Период для истории операций/i }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(250);
}

for (const vp of [
  { slug: "desktop", width: 1280, height: 900 },
  { slug: "mobile", width: 390, height: 844 },
] as const) {
  test(`period popover premium — investor dashboard (${vp.slug})`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const b = baseURL ?? "http://127.0.0.1:3000";
    const ctx = await newInvestorContext(browser, b);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await openPeriodPopover(page);
    await page.screenshot({ path: `${OUT}/dark/${vp.slug}/period-open.png`, fullPage: true });

    await ctx.close();
  });
}

