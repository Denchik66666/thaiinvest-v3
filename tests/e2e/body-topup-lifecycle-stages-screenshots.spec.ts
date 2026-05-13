import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * Этапы пополнения тела (скриншоты):
 * 1) OWNER — модалка «Пополнение» (форма).
 * 2) INVESTOR — очередь «Требуют действия» + модалка pending (все темы/вьюпорты, без принятия).
 * 3) INVESTOR — dark/desktop: принять → лента после решения.
 *
 * Папка: screenshots/compare/2026-05-09_body-topup-lifecycle-stages/{dark|light}/{desktop|mobile|s25plus}/
 *
 * Почему принятие только один раз: у GET /api/investors/operations-history серверный memory-cache ~60 с;
 * после «Да» лента может кратко расходиться с БД — повторные полные циклы по тем же данным нестабильны.
 *
 * PLAYWRIGHT_SKIP_WEBSERVER=1 при уже запущенном dev.
 */
const BASE_OUT = "screenshots/compare/2026-05-09_body-topup-lifecycle-stages";

const THEMES = [
  { slug: "dark" as const, dark: true },
  { slug: "light" as const, dark: false },
];

const VIEWPORTS = [
  { slug: "desktop" as const, width: 1280, height: 900 },
  { slug: "mobile" as const, width: 390, height: 844 },
  { slug: "s25plus" as const, width: 412, height: 915 },
];

async function apiLogin(ctx: import("@playwright/test").BrowserContext, u: string, p: string) {
  const r = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  expect(r.ok(), await r.text()).toBeTruthy();
}

async function setTheme(page: Page, dark: boolean) {
  await page.evaluate((d) => {
    localStorage.setItem("app-dark-mode", d ? "true" : "false");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  }, dark);
  await page.waitForTimeout(400);
}

function outPath(theme: string, viewport: string, name: string) {
  return path.join(process.cwd(), BASE_OUT, theme, viewport, name);
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
}

async function shot(page: Page, theme: string, viewport: string, filename: string) {
  const p = outPath(theme, viewport, filename);
  await ensureDir(p);
  await page.screenshot({ path: p, fullPage: true });
}

type LeanInv = {
  id: number;
  investorUser?: { username?: string } | null;
  linkedUser?: { username?: string } | null;
};

async function findSegaInvestorId(ctx: import("@playwright/test").BrowserContext, username: string): Promise<number | null> {
  const invRes = await ctx.request.get("/api/investors?network=common&lean=1");
  if (!invRes.ok()) return null;
  const invJson = (await invRes.json()) as { investors?: LeanInv[] };
  const list = invJson.investors ?? [];
  const row = list.find(
    (i) => i.investorUser?.username === username || i.linkedUser?.username === username
  );
  return row?.id ?? null;
}

async function ensurePendingBodyTopUp(
  ownerCtx: import("@playwright/test").BrowserContext,
  investorId: number
): Promise<void> {
  const listRes = await ownerCtx.request.get("/api/body-topup-requests");
  expect(listRes.ok(), await listRes.text()).toBeTruthy();
  const listJson = (await listRes.json()) as { requests?: { investorId: number; status: string }[] };
  const pending = (listJson.requests ?? []).some((r) => r.investorId === investorId && r.status === "pending_investor");
  if (pending) return;

  const post = await ownerCtx.request.post("/api/body-topup-requests", {
    data: { investorId, amount: 100_000, requestDate: "2026-03-04" },
  });
  expect(post.ok(), await post.text()).toBeTruthy();
}

async function openInvestorTopUpModal(page: Page) {
  const queueTopup = page.getByRole("button", { name: /Пополнение/i }).first();
  const topupActionRow = page
    .locator('[data-finance-history-attention="action"]')
    .filter({ hasText: /Пополнение/ })
    .filter({ hasText: /заявка/i })
    .first();
  if (await queueTopup.isVisible().catch(() => false)) {
    await queueTopup.click();
  } else if (await topupActionRow.isVisible().catch(() => false)) {
    await topupActionRow.click();
  } else {
    const popolnenieFallback = page
      .locator("[data-finance-sub-feed]")
      .locator("div")
      .filter({ hasText: /Пополнение/ })
      .filter({ hasText: /заявка/i })
      .first();
    await expect(popolnenieFallback, "Нет пополнения в очереди и в ленте").toBeVisible({ timeout: 30_000 });
    await popolnenieFallback.click();
  }
  await expect(page.getByText("Карточка операции", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Сводка", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Требует действия", { exact: true })).toBeVisible({ timeout: 45_000 });
}

test("body top-up: скриншоты этапов (форма OWNER, очередь+модалка по вьюпортам, принятие в конце)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(600_000);
  const b = baseURL ?? "http://127.0.0.1:3000";
  const samPw = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";
  const invUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const invPw = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

  const ownerCtx = await browser.newContext({ baseURL: b });
  await apiLogin(ownerCtx, "Sam", samPw);
  const investorId = await findSegaInvestorId(ownerCtx, invUser);
  if (investorId == null) {
    await ownerCtx.close();
    test.skip(true, "Нет позиции Sega в common-сети Sam (/api/investors).");
    return;
  }
  await ensurePendingBodyTopUp(ownerCtx, investorId);

  const ownerPage = await ownerCtx.newPage();
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await ownerPage.goto("/dashboard/finance", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await setTheme(ownerPage, true);
  await expect(ownerPage.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  const topUpBtn = ownerPage.getByRole("button", { name: "Пополнение", exact: true });
  if (await topUpBtn.isVisible().catch(() => false)) {
    await topUpBtn.click();
    await expect(ownerPage.getByText(/Запрос на пополнение|пополнение тела/i).first()).toBeVisible({ timeout: 25_000 });
    await shot(ownerPage, "dark", "desktop", "01-owner-finance-body-topup-form.png");
    await ownerPage.keyboard.press("Escape").catch(() => {});
  }
  await ownerPage.close();
  await ownerCtx.close();

  for (const { slug: theme, dark } of THEMES) {
    for (const { slug: vp, width, height } of VIEWPORTS) {
      const invCtx = await browser.newContext({ baseURL: b });
      await apiLogin(invCtx, invUser, invPw);
      const page = await invCtx.newPage();
      await page.setViewportSize({ width, height });
      await page.goto("/dashboard/finance", { waitUntil: "networkidle", timeout: 180_000 }).catch(async () => {
        await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded", timeout: 120_000 });
      });
      await setTheme(page, dark);
      await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Требуют действия", { exact: true })).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(400);
      await shot(page, theme, vp, "02-investor-finance-pending-queue.png");

      await openInvestorTopUpModal(page);
      await page.waitForTimeout(350);
      await shot(page, theme, vp, "03-investor-modal-pending.png");
      await page.keyboard.press("Escape").catch(() => {});
      await expect(page.getByText("Карточка операции", { exact: true })).toBeHidden({ timeout: 20_000 }).catch(() => {});
      await page.close();
      await invCtx.close();
    }
  }

  const finCtx = await browser.newContext({ baseURL: b });
  await apiLogin(finCtx, invUser, invPw);
  const finPage = await finCtx.newPage();
  await finPage.setViewportSize({ width: 1280, height: 900 });
  await finPage.goto("/dashboard/finance", { waitUntil: "networkidle", timeout: 180_000 }).catch(async () => {
    await finPage.goto("/dashboard/finance", { waitUntil: "domcontentloaded", timeout: 120_000 });
  });
  await setTheme(finPage, true);
  await expect(finPage.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await openInvestorTopUpModal(finPage);

  const accept = finPage.locator('[aria-label="Принять пополнение"]');
  await expect(accept).toBeVisible({ timeout: 25_000 });
  await accept.click();
  await expect(finPage.getByText("Карточка операции", { exact: true })).toBeHidden({ timeout: 45_000 });
  await finPage.waitForTimeout(600);
  await shot(finPage, "dark", "desktop", "04-investor-finance-after-accept.png");
  await finPage.close();
  await finCtx.close();
});
