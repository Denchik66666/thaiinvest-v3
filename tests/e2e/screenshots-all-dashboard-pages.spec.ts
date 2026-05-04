import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

/**
 * Скриншоты всех страниц дашборда (тёмная + светлая) → screenshots/all-pages/
 * Сессия с ролью OWNER/SUPER_ADMIN (иначе /dashboard/manage редиректит); INVESTOR: Sega_55RUS → /dashboard (кабинет).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
 * PLAYWRIGHT_SKIP_WEBSERVER=1 — если dev уже запущен
 * PLAYWRIGHT_LOGIN_USER / PLAYWRIGHT_LOGIN_PASSWORD — явный менеджер
 */
const INVESTOR_PASS_DEFAULT = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "admin123";

const OUT = "screenshots/all-pages";

/** Контекст с cookie сессии OWNER или SUPER_ADMIN (как в scripts/e2e-scenario-check.mjs). */
async function newBrowserContextWithManagerSession(browser: Browser, baseURL: string) {
  const explicit = process.env.PLAYWRIGHT_LOGIN_USER;
  const candidates = explicit
    ? [{ u: explicit, p: process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123" }]
    : [
        // prisma/seed.ts: admin=SUPER_ADMIN, semen=OWNER (admin первым — полный список сетей для id)
        { u: "admin", p: "admin123" },
        { u: "semen", p: "admin123" },
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
  throw new Error(
    "Не удалось войти как OWNER/SUPER_ADMIN. Задайте PLAYWRIGHT_LOGIN_USER + PLAYWRIGHT_LOGIN_PASSWORD."
  );
}

async function newBrowserContextWithInvestorSession(browser: Browser, baseURL: string) {
  const explicit = process.env.PLAYWRIGHT_INVESTOR_USER;
  const rows = explicit
    ? [{ u: explicit, p: INVESTOR_PASS_DEFAULT }]
    : [{ u: "Sega_55RUS", p: "admin123" }];
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
  throw new Error(
    "Не удалось войти как INVESTOR для /dashboard. Задайте PLAYWRIGHT_INVESTOR_USER + PLAYWRIGHT_INVESTOR_PASSWORD (учётка Sega_55RUS)."
  );
}

async function resolveInvestorDetailId(request: APIRequestContext): Promise<number> {
  const r = await request.get("/api/investors?network=all&lean=1");
  if (!r.ok()) throw new Error(`investors list ${r.status()}: ${await r.text()}`);
  const j = (await r.json()) as { investors: Array<{ id: number; name: string }> };
  const list = j.investors ?? [];
  const full = list.find((inv) => /денис/i.test(inv.name) && /юрьевич/i.test(inv.name));
  if (full) return full.id;
  const denis = list.find((inv) => /денис/i.test(inv.name));
  if (denis) return denis.id;
  const first = list[0];
  if (!first) throw new Error("Нет инвесторов в БД для скриншота карточки");
  return first.id;
}

test("all dashboard pages screenshots dark + light", async ({ browser, baseURL }) => {
  test.setTimeout(360_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  async function setTheme(page: import("@playwright/test").Page, dark: boolean) {
    await page.evaluate((d) => {
      localStorage.setItem("app-dark-mode", d ? "true" : "false");
      window.dispatchEvent(new Event("thaiinvest-theme-storage"));
    }, dark);
    await page.waitForTimeout(500);
  }

  async function shot(page: import("@playwright/test").Page, slug: string, theme: "dark" | "light") {
    await page.screenshot({ path: `${OUT}/${slug}-${theme}.png`, fullPage: true });
  }

  async function gotoDashboardPath(page: import("@playwright/test").Page, path: string) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const chunkBroken = page.locator("text=/ChunkLoadError|couldn.*t load/i");
    if ((await chunkBroken.count()) > 0 && (await chunkBroken.first().isVisible().catch(() => false))) {
      const reload = page.getByRole("button", { name: "Reload" }).first();
      if ((await reload.count()) > 0) {
        await reload.click();
        await page.waitForLoadState("load");
        await page.waitForTimeout(800);
      }
    }
  }

  const adminContext = await newBrowserContextWithManagerSession(browser, b);
  const adminRequest = adminContext.request;
  const investorId = await resolveInvestorDetailId(adminRequest);

  const adminPage = await adminContext.newPage();
  await adminPage.setViewportSize({ width: 1280, height: 900 });
  await gotoDashboardPath(adminPage, "/dashboard");
  await expect(adminPage.locator(".thai-dashboard-root h1")).toBeVisible({ timeout: 90_000 });

  const adminPaths: { slug: string; path: string; wait?: () => Promise<void> }[] = [
    { slug: "dashboard", path: "/dashboard", wait: async () => {
      await expect(adminPage.locator(".thai-dashboard-root h1")).toBeVisible({ timeout: 90_000 });
    }},
    { slug: "investors", path: "/dashboard/investors", wait: async () => {
      await expect(adminPage.getByRole("heading", { name: "Список позиций" })).toBeVisible({ timeout: 90_000 });
    }},
    { slug: "investors-id", path: `/dashboard/investors/${investorId}`, wait: async () => {
      await expect(adminPage.getByRole("button", { name: "К списку" })).toBeVisible({ timeout: 120_000 });
      await adminPage.waitForTimeout(600);
    }},
    { slug: "manage", path: "/dashboard/manage", wait: async () => {
      await expect(adminPage.getByText("Центр операционных действий")).toBeVisible({ timeout: 120_000 });
    }},
    { slug: "profile", path: "/dashboard/profile", wait: async () => {
      await expect(adminPage.locator(".thai-dashboard-root")).toBeVisible({ timeout: 120_000 });
      await expect(adminPage.getByRole("button", { name: "Безопасность" })).toBeVisible({ timeout: 30_000 });
    }},
    { slug: "chat", path: "/dashboard/chat", wait: async () => {
      await expect(adminPage.getByRole("button", { name: "Главная" })).toBeVisible({ timeout: 120_000 });
      await adminPage.waitForTimeout(600);
    }},
    { slug: "reports", path: "/dashboard/reports", wait: async () => {
      await expect(adminPage.getByText("Отчёты", { exact: false }).first()).toBeVisible({ timeout: 120_000 });
      await adminPage.waitForTimeout(600);
    }},
  ];

  for (const theme of ["dark", "light"] as const) {
    await setTheme(adminPage, theme === "dark");
    for (const { slug, path, wait } of adminPaths) {
      await gotoDashboardPath(adminPage, path);
      if (wait) await wait();
      await shot(adminPage, slug, theme);
      await adminPage.waitForTimeout(600);
    }
  }

  await adminContext.close();

  const invContext = await newBrowserContextWithInvestorSession(browser, b);
  const invPage = await invContext.newPage();
  await invPage.setViewportSize({ width: 1280, height: 900 });
  await gotoDashboardPath(invPage, "/dashboard");
  await expect(invPage.getByText("Твои показатели", { exact: false }).first()).toBeVisible({ timeout: 120_000 });

  for (const theme of ["dark", "light"] as const) {
    await setTheme(invPage, theme === "dark");
    await gotoDashboardPath(invPage, "/dashboard");
    await expect(invPage.getByText("Твои показатели", { exact: false }).first()).toBeVisible({ timeout: 120_000 });
    await invPage.waitForTimeout(400);
    await shot(invPage, "finance", theme);
  }

  await invContext.close();
});
