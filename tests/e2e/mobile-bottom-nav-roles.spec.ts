import { expect, test, type Browser } from "@playwright/test";

const INVESTOR_PASS_DEFAULT = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "admin123";

function bottomNav(page: import("@playwright/test").Page) {
  return page.locator(".fixed.bottom-0.pointer-events-none nav");
}

async function newContextOwner(browser: Browser, baseURL: string) {
  const explicit = process.env.PLAYWRIGHT_OWNER_USER;
  const candidates = explicit
    ? [{ u: explicit, p: process.env.PLAYWRIGHT_OWNER_PASSWORD ?? process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123" }]
    : [
        { u: "semen", p: "admin123" },
        { u: "admin", p: "admin123" },
      ];
  for (const { u, p } of candidates) {
    const ctx = await browser.newContext({ baseURL });
    const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
    if (!loginRes.ok()) {
      const errBody = await loginRes.text().catch(() => "");
      await ctx.close();
      if (explicit) throw new Error(`OWNER login ${loginRes.status()}: ${errBody}`);
      continue;
    }
    const me = await ctx.request.get("/api/auth/me");
    if (!me.ok()) {
      await ctx.close();
      continue;
    }
    const body = (await me.json()) as { user?: { role?: string } };
    if (body.user?.role === "OWNER") return ctx;
    await ctx.close();
  }
  throw new Error("Не удалось войти как OWNER (API). Задайте PLAYWRIGHT_OWNER_USER / PLAYWRIGHT_OWNER_PASSWORD.");
}

async function newContextInvestor(browser: Browser, baseURL: string) {
  const explicit = process.env.PLAYWRIGHT_INVESTOR_USER;
  const rows = explicit
    ? [{ u: explicit, p: INVESTOR_PASS_DEFAULT }]
    : [
        { u: "Sega_55RUS", p: "admin123" },
        { u: "Sega_55RUS", p: INVESTOR_PASS_DEFAULT },
      ];
  const seen = new Set<string>();
  for (const { u, p } of rows) {
    const key = `${u}:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
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
    if (body.user?.role === "INVESTOR") return ctx;
    await ctx.close();
  }
  throw new Error("Не удалось войти как INVESTOR (API). Задайте PLAYWRIGHT_INVESTOR_USER / PLAYWRIGHT_INVESTOR_PASSWORD.");
}

async function newContextSuperAdmin(browser: Browser, baseURL: string) {
  const u = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? process.env.PLAYWRIGHT_LOGIN_USER ?? "admin";
  const p = process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ?? process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  if (!loginRes.ok()) {
    await ctx.close();
    throw new Error(`SUPER_ADMIN login ${loginRes.status()}: ${await loginRes.text()}`);
  }
  const me = await ctx.request.get("/api/auth/me");
  const body = (await me.json()) as { user?: { role?: string } };
  if (body.user?.role !== "SUPER_ADMIN") {
    await ctx.close();
    throw new Error(`Ожидали SUPER_ADMIN, получили ${body.user?.role} для ${u}`);
  }
  return ctx;
}

test.describe("нижний бар по ролям", () => {
  test("INVESTOR: Главная, Отчёты, Профиль — без Финансы и Инвесторы", async ({ browser, baseURL }) => {
    const b = baseURL ?? "http://127.0.0.1:3000";
    const ctx = await newContextInvestor(browser, b);
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const nav = bottomNav(page);
    await expect(nav.getByText("Главная", { exact: true })).toBeVisible();
    await expect(nav.getByText("Отчёты", { exact: true })).toBeVisible();
    await expect(nav.getByText("Профиль", { exact: true })).toBeVisible();
    await expect(nav.getByText("Финансы", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Инвесторы", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Управление", { exact: true })).toHaveCount(0);
    await nav.screenshot({ path: "screenshots/bottom-nav/INVESTOR.png" });
    await ctx.close();
  });

  test("OWNER: Главная, Инвесторы, Управление, Отчёты", async ({ browser, baseURL }) => {
    const b = baseURL ?? "http://127.0.0.1:3000";
    const ctx = await newContextOwner(browser, b);
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const nav = bottomNav(page);
    await expect(nav.getByText("Главная", { exact: true })).toBeVisible();
    await expect(nav.getByText("Инвесторы", { exact: true })).toBeVisible();
    await expect(nav.getByText("Управление", { exact: true })).toBeVisible();
    await expect(nav.getByText("Отчёты", { exact: true })).toBeVisible();
    await expect(nav.getByText("Финансы", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Профиль", { exact: true })).toHaveCount(0);
    await nav.screenshot({ path: "screenshots/bottom-nav/OWNER.png" });
    await ctx.close();
  });

  test("SUPER_ADMIN: Главная, Инвесторы, Управление, Отчёты", async ({ browser, baseURL }) => {
    const b = baseURL ?? "http://127.0.0.1:3000";
    const ctx = await newContextSuperAdmin(browser, b);
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const nav = bottomNav(page);
    await expect(nav.getByText("Главная", { exact: true })).toBeVisible();
    await expect(nav.getByText("Инвесторы", { exact: true })).toBeVisible();
    await expect(nav.getByText("Управление", { exact: true })).toBeVisible();
    await expect(nav.getByText("Отчёты", { exact: true })).toBeVisible();
    await expect(nav.getByText("Финансы", { exact: true })).toHaveCount(0);
    await nav.screenshot({ path: "screenshots/bottom-nav/SUPER_ADMIN.png" });
    await ctx.close();
  });
});
