import { expect, test, type Browser } from "@playwright/test";

/**
 * Открытые попапы периода (HistoryPeriodPopover) и даты (DatePicker) — «Финансы» vs «Управление».
 * Выход: screenshots/compare/2026-05-09_calendar-finance-vs-manage/
 */
const OUT = "screenshots/compare/2026-05-09_calendar-finance-vs-manage";

async function newBrowserContextWithManagerSession(browser: Browser, baseURL: string) {
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

test("open calendar popovers: finance vs manage screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const b = baseURL ?? "http://127.0.0.1:3000";
  const ctx = await newBrowserContextWithManagerSession(browser, b);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  const dialog = page.getByRole("dialog");

  // —— Финансы: период ——
  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("app-dark-mode", "true");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  });
  await page.reload({ waitUntil: "load" });
  await expect(page.getByRole("button", { name: /^Период:/i }).first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /^Период:/i }).first().click();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const financeDialogW = await dialog.evaluate((el) => el.getBoundingClientRect().width);
  await dialog.screenshot({ path: `${OUT}/1-finance-history-period-dialog.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // —— Управление: период в журнале ——
  await page.goto("/dashboard/manage", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Управление" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Ставка сети", { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Развернуть историю" }).click();
  await expect(page.getByRole("button", { name: /^Период:/i }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Период:/i }).first().click();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const managePeriodW = await dialog.evaluate((el) => el.getBoundingClientRect().width);
  await dialog.screenshot({ path: `${OUT}/2-manage-history-period-dialog.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // —— Управление: DatePicker «Понедельник» ——
  await page.getByRole("button", { name: /Понедельник в записи/i }).click();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const manageDpW = await dialog.evaluate((el) => el.getBoundingClientRect().width);
  await dialog.screenshot({ path: `${OUT}/3-manage-datepicker-monday-dialog.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  expect(Math.round(managePeriodW), `manage HistoryPeriod dialog width vs finance ${financeDialogW}`).toBe(
    Math.round(financeDialogW)
  );
  expect(Math.round(manageDpW), `manage DatePicker dialog width vs finance ${financeDialogW}`).toBe(
    Math.round(financeDialogW)
  );

  await ctx.close();
});
