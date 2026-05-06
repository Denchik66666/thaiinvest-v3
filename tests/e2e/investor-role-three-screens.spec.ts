import { expect, test, type Browser } from "@playwright/test";

/**
 * Три ключевых экрана INVESTOR: главная, финансы, профиль.
 * Темы + вьюпорты по правилам проекта (см. PROJECT_AUDIT.md, compare-owner-vs-investor-dashboard.spec.ts).
 *
 * PLAYWRIGHT_SKIP_WEBSERVER=1 при уже запущенном dev.
 * PLAYWRIGHT_INVESTOR_USER / PLAYWRIGHT_INVESTOR_PASSWORD при необходимости.
 */
const BASE_OUT = "screenshots/compare/2026-05-06_investor-main-finance-profile";

const THEMES = [
  { slug: "dark", dark: true },
  { slug: "light", dark: false },
] as const;

const VIEWPORTS = [
  { slug: "desktop", width: 1280, height: 900 },
  /** Узкий мобильный (паритет compare-owner-vs-investor) */
  { slug: "mobile", width: 390, height: 844 },
  /** Galaxy S25+ (CSS viewport) */
  { slug: "s25plus", width: 412, height: 915 },
] as const;

const INVESTOR_PASS_DEFAULT = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

async function newBrowserContextWithInvestorSession(browser: Browser, baseURL: string) {
  const explicit = process.env.PLAYWRIGHT_INVESTOR_USER;
  const rows = explicit
    ? [{ u: explicit, p: INVESTOR_PASS_DEFAULT }]
    : [{ u: "Sega_55RUS", p: "qwerty123" }];
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
  throw new Error("Не удалось войти как INVESTOR (Sega_55RUS / PLAYWRIGHT_INVESTOR_USER).");
}

async function pageShowsChunkFailure(page: import("@playwright/test").Page): Promise<boolean> {
  const fallbackHeading = page.getByRole("heading", { name: /couldn.*t load|не удалось загрузить/i });
  const chunkOverlay = page.locator("text=/ChunkLoadError|Runtime ChunkLoadError/i").first();
  return (
    (await fallbackHeading.isVisible().catch(() => false)) ||
    (await chunkOverlay.isVisible().catch(() => false))
  );
}

/**
 * Dev/Webpack: иногда отдаёт ChunkLoadError на layout chunk — без успешного Reload не продолжаем (иначе падаем на assert по таймауту).
 */
async function gotoDashboardOrRecoverChunk(page: import("@playwright/test").Page, path: string, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(path, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(i === 0 ? 600 : 900);

    let broken = await pageShowsChunkFailure(page);
    if (!broken) {
      await page.waitForTimeout(350);
      broken = await pageShowsChunkFailure(page);
    }
    if (!broken) return;

    const reload = page.getByRole("button", { name: "Reload" }).first();
    if ((await reload.count()) > 0) {
      await reload.click({ timeout: 8000 }).catch(() => {});
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(1400);
      if (!(await pageShowsChunkFailure(page))) return;
    }

    await page.evaluate(() => window.location.reload());
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(1600);
    if (!(await pageShowsChunkFailure(page))) return;

    await page.reload({ waitUntil: "load", timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(1400);
  }

  if (await pageShowsChunkFailure(page)) {
    throw new Error(
      `[screenshots] Страница не загрузилась после ${attempts} попыток (chunk error): ${path}. Перезапустите dev или выполните скриншоты на «npm run build && npm run start».`
    );
  }
}

/** Отдельный тест на тему — меньше давления на dev-сервер и понятнее перезапуск при ChunkLoadError. */
for (const theme of THEMES) {
  test(`investor main + finance + profile (${theme.slug} × desktop/mobile/S25+)`, async ({ browser, baseURL }) => {
    test.setTimeout(480_000);
    const b = baseURL ?? "http://127.0.0.1:3000";

    for (const vp of VIEWPORTS) {
      const ctx = await newBrowserContextWithInvestorSession(browser, b);
      await ctx.addInitScript((dark: boolean) => {
        localStorage.setItem("app-dark-mode", dark ? "true" : "false");
      }, theme.dark);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const prefix = `${BASE_OUT}/${theme.slug}/${vp.slug}`;

      await gotoDashboardOrRecoverChunk(page, "/dashboard");
      await page.evaluate(() => window.dispatchEvent(new Event("thaiinvest-theme-storage")));
      await page.waitForTimeout(400);
      await expect(page.locator(".thai-investor-hero-panel").first()).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText("Доступно к выводу", { exact: false }).first()).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${prefix}/1-dashboard.png`, fullPage: true });

      await gotoDashboardOrRecoverChunk(page, "/dashboard/finance");
      await page.evaluate(() => window.dispatchEvent(new Event("thaiinvest-theme-storage")));
      await page.waitForTimeout(150);
      await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText("Лента", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${prefix}/2-finance.png`, fullPage: true });

      /** После «Финансов» dev иногда не успевает отдать layout chunk для профиля — пауза и больше попыток. */
      await page.waitForTimeout(theme.dark ? 450 : 2200);
      await gotoDashboardOrRecoverChunk(page, "/dashboard/profile", theme.dark ? 10 : 18);
      await page.evaluate(() => window.dispatchEvent(new Event("thaiinvest-theme-storage")));
      await page.waitForTimeout(150);
      await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByRole("navigation", { name: "Разделы профиля" })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${prefix}/3-profile.png`, fullPage: true });

      await ctx.close();
      await new Promise((r) => setTimeout(r, 450));
    }
  });
}
