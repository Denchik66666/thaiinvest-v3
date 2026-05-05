import { expect, test, type Browser } from "@playwright/test";

/**
 * Правило: скриншоты сравнения кладём в отдельную папку с датой и темой сравнения,
 * имена файлов — роль + маршрут + тема + вьюпорт.
 *
 * Сравнение: OWNER vs INVESTOR → /dashboard (верхушка + hero + payout block).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
 * PLAYWRIGHT_SKIP_WEBSERVER=1 — если dev уже запущен
 */
const OUT = "screenshots/compare/2026-05-05_compact-hero-history_owner-vs-investor";

const CREDS = {
  admin: { u: "admin", p: "admin123" }, // SUPER_ADMIN
  owner: { u: "Sam", p: "admin123" }, // OWNER (Семён)
  investor: { u: "Sega_55RUS", p: "qwerty123" }, // INVESTOR
} as const;

async function newContextWithLogin(browser: Browser, baseURL: string, u: string, p: string) {
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  if (!loginRes.ok()) {
    const t = await loginRes.text();
    await ctx.close();
    throw new Error(`Login failed ${loginRes.status()}: ${t}`);
  }
  const me = await ctx.request.get("/api/auth/me");
  if (!me.ok()) {
    const t = await me.text();
    await ctx.close();
    throw new Error(`Auth check failed ${me.status()}: ${t}`);
  }
  return ctx;
}

async function setTheme(page: import("@playwright/test").Page, dark: boolean) {
  // localStorage доступен только после навигации на same-origin страницу.
  await page.evaluate((d) => {
    localStorage.setItem("app-dark-mode", d ? "true" : "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  }, dark);
  await page.waitForTimeout(500);
}

async function gotoDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard(\/)?$/, { timeout: 120_000 });
  // Дашборд может подгружать данные; для скрина нам важна стабильная отрисовка.
  await page.waitForTimeout(900);
}

async function shot(
  page: import("@playwright/test").Page,
  role: "OWNER" | "INVESTOR",
  theme: "dark" | "light",
  viewport: "desktop" | "mobile" | "s25plus"
) {
  const slug = `${role.toLowerCase()}-dashboard-${theme}-${viewport}`;
  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });
}

test("compare OWNER vs INVESTOR /dashboard screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  const ownerCtx = await newContextWithLogin(browser, b, CREDS.owner.u, CREDS.owner.p);
  const investorCtx = await newContextWithLogin(browser, b, CREDS.investor.u, CREDS.investor.p);

  const ownerPage = await ownerCtx.newPage();
  const investorPage = await investorCtx.newPage();

  // Desktop parity (как на референсе "Owner vs Investors")
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await investorPage.setViewportSize({ width: 1280, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage);
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage);
    await shot(ownerPage, "OWNER", theme, "desktop");

    await gotoDashboard(investorPage);
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage);
    await shot(investorPage, "INVESTOR", theme, "desktop");
  }

  // Mobile parity (для проверки компоновки и кликабельности шапки)
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await investorPage.setViewportSize({ width: 390, height: 844 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage);
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage);
    await shot(ownerPage, "OWNER", theme, "mobile");

    await gotoDashboard(investorPage);
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage);
    await shot(investorPage, "INVESTOR", theme, "mobile");
  }

  // Galaxy S25+ (CSS viewport)
  await ownerPage.setViewportSize({ width: 412, height: 915 });
  await investorPage.setViewportSize({ width: 412, height: 915 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage);
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage);
    await shot(ownerPage, "OWNER", theme, "s25plus");

    await gotoDashboard(investorPage);
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage);
    await shot(investorPage, "INVESTOR", theme, "s25plus");
  }

  await ownerCtx.close();
  await investorCtx.close();
});

