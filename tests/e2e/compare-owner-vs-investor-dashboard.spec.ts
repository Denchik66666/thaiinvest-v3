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

async function gotoDashboard(page: import("@playwright/test").Page, role: "OWNER" | "INVESTOR") {
  const heroSel = role === "OWNER" ? ".thai-owner-hero-panel" : ".thai-investor-hero-panel";

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

  const hero = page.locator(heroSel).first();

  await expect(page.getByText("Открытая неделя").first()).toBeVisible({ timeout: 60_000 });
  if (role === "OWNER") {
    await expect(page.getByText("Журнал сети").first()).toBeVisible({ timeout: 90_000 });
  } else {
    await expect(page.getByText("История операций").first()).toBeVisible({ timeout: 90_000 });
  }

  if (role === "OWNER") {
    await expect(page.locator(".thai-owner-payout-hero").getByRole("button", { name: "Финансы" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Инвесторы в сети").first()).toBeVisible({ timeout: 60_000 });
  } else {
    await expect(page.getByText("Доступно к выводу").first()).toBeVisible({ timeout: 60_000 });
  }

  // После isBusy появляется счётчик рядом с заголовком (единый маркер готовности ленты).
  await expect(
    hero.locator(".thai-dashboard-history-embedded").getByTitle("С учётом периода и типа операций")
  ).toBeVisible({ timeout: 90_000 });

  await page.waitForTimeout(500);
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
  test.setTimeout(600_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  const ownerCtx = await newContextWithLogin(browser, b, CREDS.owner.u, CREDS.owner.p);
  const investorCtx = await newContextWithLogin(browser, b, CREDS.investor.u, CREDS.investor.p);

  const ownerPage = await ownerCtx.newPage();
  const investorPage = await investorCtx.newPage();

  // Desktop parity (как на референсе "Owner vs Investors")
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await investorPage.setViewportSize({ width: 1280, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage, "OWNER");
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage, "OWNER");
    await shot(ownerPage, "OWNER", theme, "desktop");

    await gotoDashboard(investorPage, "INVESTOR");
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage, "INVESTOR");
    await shot(investorPage, "INVESTOR", theme, "desktop");
  }

  // Mobile parity (для проверки компоновки и кликабельности шапки)
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await investorPage.setViewportSize({ width: 390, height: 844 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage, "OWNER");
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage, "OWNER");
    await shot(ownerPage, "OWNER", theme, "mobile");

    await gotoDashboard(investorPage, "INVESTOR");
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage, "INVESTOR");
    await shot(investorPage, "INVESTOR", theme, "mobile");
  }

  // Galaxy S25+ (CSS viewport)
  await ownerPage.setViewportSize({ width: 412, height: 915 });
  await investorPage.setViewportSize({ width: 412, height: 915 });

  for (const theme of ["dark", "light"] as const) {
    await gotoDashboard(ownerPage, "OWNER");
    await setTheme(ownerPage, theme === "dark");
    await gotoDashboard(ownerPage, "OWNER");
    await shot(ownerPage, "OWNER", theme, "s25plus");

    await gotoDashboard(investorPage, "INVESTOR");
    await setTheme(investorPage, theme === "dark");
    await gotoDashboard(investorPage, "INVESTOR");
    await shot(investorPage, "INVESTOR", theme, "s25plus");
  }

  await ownerCtx.close();
  await investorCtx.close();
});

