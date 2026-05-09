import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Регрессия: OWNER видит реестр; SUPER_ADMIN — клик по нику/карточке ведёт на /dashboard/investors/[id].
 * Скриншоты: screenshots/compare/2026-05-09_owner-investors-finance-nick/
 */
const OUT = "screenshots/compare/2026-05-09_owner-investors-finance-nick";

test.beforeAll(() => {
  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
});

test("OWNER investors registry + SUPER_ADMIN finance nick → investor card", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const samPw = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";
  const denUser = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "Den";
  const denPw = process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ?? process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "den123";

  let loginSam = await context.request.post("/api/auth/login", {
    data: { username: "Sam", password: samPw },
  });
  if (!loginSam.ok()) {
    loginSam = await context.request.post("/api/auth/login", {
      data: { username: "Sam", password: "admin123" },
    });
  }
  expect(loginSam.ok(), await loginSam.text()).toBeTruthy();

  await page.goto("/dashboard/investors", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Список позиций" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("В списке", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/1-owner-investors-registry.png`, fullPage: true });

  await context.request.post("/api/auth/logout");

  let loginDen = await context.request.post("/api/auth/login", {
    data: { username: denUser, password: denPw },
  });
  if (!loginDen.ok()) {
    for (const p of ["admin123", "den123"]) {
      loginDen = await context.request.post("/api/auth/login", { data: { username: denUser, password: p } });
      if (loginDen.ok()) break;
    }
  }
  expect(loginDen.ok(), await loginDen.text()).toBeTruthy();

  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Инвесторы в сети", { exact: false }).first()).toBeVisible({ timeout: 60_000 });

  const openCard = page.locator("button[data-finance-investor-profile-open]").first();
  await expect(openCard).toBeVisible({ timeout: 30_000 });
  await openCard.click();
  await expect(page).toHaveURL(/\/dashboard\/investors\/\d+/, { timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/2-super-admin-finance-nick-investor-card.png`, fullPage: true });

  await context.request.post("/api/auth/logout");
  const invUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const invPw = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";
  const loginInv = await context.request.post("/api/auth/login", { data: { username: invUser, password: invPw } });
  expect(loginInv.ok(), await loginInv.text()).toBeTruthy();
  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /^Период/i }).first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/3-investor-finance.png`, fullPage: true });
});
