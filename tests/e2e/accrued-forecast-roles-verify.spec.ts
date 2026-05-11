import { expect, test, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * После пересчёта accrued и правок прогноза: скриншоты героя дашборда INVESTOR (Sega_55RUS)
 * и OWNER (Sam) — плитка «Начислено»/сеть и строка «Ожидается» (целые баты).
 *
 * PLAYWRIGHT_BASE_URL, PLAYWRIGHT_SKIP_WEBSERVER — как в остальных e2e.
 */
const BASE_OUT = path.join("screenshots", "compare", "2026-05-09_accrued-forecast-roles");

async function newContextWithLogin(browser: Browser, baseURL: string, u: string, passwords: string[]) {
  const ctx = await browser.newContext({ baseURL });
  let lastErr = "";
  for (const p of passwords) {
    const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
    if (loginRes.ok()) return ctx;
    lastErr = await loginRes.text();
  }
  await ctx.close();
  throw new Error(`Login failed for ${u}: ${lastErr}`);
}

async function setTheme(page: import("@playwright/test").Page, dark: boolean) {
  await page.evaluate((d) => {
    localStorage.setItem("app-dark-mode", d ? "true" : "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  }, dark);
  await page.waitForTimeout(400);
}

test("INVESTOR Sega + OWNER Sam: hero accrued + Ожидается (desktop dark/light + dark mobile/s25+)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(360_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  const samPasswords = [
    process.env.PLAYWRIGHT_OWNER_PASSWORD,
    process.env.PLAYWRIGHT_LOGIN_PASSWORD,
    "admin123",
  ].filter((x): x is string => Boolean(x));

  for (const theme of ["dark", "light"] as const) {
    const outDir = path.join(BASE_OUT, theme, "desktop");
    fs.mkdirSync(outDir, { recursive: true });

    const invCtx = await newContextWithLogin(browser, b, "Sega_55RUS", [
      process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123",
    ]);
    const invPage = await invCtx.newPage();
    await invPage.setViewportSize({ width: 1280, height: 900 });
    await invPage.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setTheme(invPage, theme === "dark");
    await invPage.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
    const invHero = invPage.locator(".thai-investor-hero-panel").first();
    await invHero.waitFor({ state: "visible", timeout: 120_000 });
    await expect(invPage.getByText("Ожидается").first()).toBeVisible({ timeout: 90_000 });
    await expect(invPage.getByText("Начислено сейчас").first()).toBeVisible({ timeout: 60_000 });
    const invStrip = invPage.locator(".thai-investor-forecast-strip").first();
    const invText = await invStrip.textContent();
    expect(invText, "прогноз без десятичных по шаблону ,00").not.toMatch(/,\d{2}\s*฿/);
    await invHero.screenshot({ path: path.join(outDir, "1-investor-sega-hero.png") });
    await invCtx.close();

    const ownCtx = await newContextWithLogin(browser, b, "Sam", samPasswords);
    const ownPage = await ownCtx.newPage();
    await ownPage.setViewportSize({ width: 1280, height: 900 });
    await ownPage.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setTheme(ownPage, theme === "dark");
    await ownPage.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
    const ownHero = ownPage.locator(".thai-owner-hero-panel").first();
    await ownHero.waitFor({ state: "visible", timeout: 120_000 });
    await expect(ownPage.getByText("Ожидается").first()).toBeVisible({ timeout: 90_000 });
    await expect(ownPage.getByText("Начислено").first()).toBeVisible({ timeout: 60_000 });
    const ownStrip = ownPage.locator(".thai-owner-forecast-strip").filter({ hasText: "Ожидается" }).first();
    const ownText = await ownStrip.textContent();
    expect(ownText, "OWNER: прогноз без десятичных ,00").not.toMatch(/,\d{2}\s*฿/);
    await ownHero.screenshot({ path: path.join(outDir, "2-owner-sam-hero.png") });
    await ownCtx.close();
  }

  const darkMobileDir = path.join(BASE_OUT, "dark", "mobile");
  const darkS25Dir = path.join(BASE_OUT, "dark", "s25plus");
  fs.mkdirSync(darkMobileDir, { recursive: true });
  fs.mkdirSync(darkS25Dir, { recursive: true });

  for (const { label, w, h } of [
    { label: "mobile", w: 390, h: 844 },
    { label: "s25plus", w: 412, h: 915 },
  ] as const) {
    const outDir = label === "mobile" ? darkMobileDir : darkS25Dir;

    const invCtx = await newContextWithLogin(browser, b, "Sega_55RUS", [
      process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123",
    ]);
    const invPage = await invCtx.newPage();
    await invPage.setViewportSize({ width: w, height: h });
    await invPage.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setTheme(invPage, true);
    await invPage.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
    await invPage.locator(".thai-investor-hero-panel").first().waitFor({ state: "visible", timeout: 120_000 });
    await expect(invPage.getByText("Ожидается").first()).toBeVisible({ timeout: 90_000 });
    await invPage
      .locator(".thai-investor-hero-panel")
      .first()
      .screenshot({ path: path.join(outDir, `1-investor-sega-hero-${label}.png`) });
    await invCtx.close();

    const ownCtx = await newContextWithLogin(browser, b, "Sam", samPasswords);
    const ownPage = await ownCtx.newPage();
    await ownPage.setViewportSize({ width: w, height: h });
    await ownPage.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setTheme(ownPage, true);
    await ownPage.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
    await ownPage.locator(".thai-owner-hero-panel").first().waitFor({ state: "visible", timeout: 120_000 });
    await expect(ownPage.getByText("Ожидается").first()).toBeVisible({ timeout: 90_000 });
    await ownPage
      .locator(".thai-owner-hero-panel")
      .first()
      .screenshot({ path: path.join(outDir, `2-owner-sam-hero-${label}.png`) });
    await ownCtx.close();
  }
});
