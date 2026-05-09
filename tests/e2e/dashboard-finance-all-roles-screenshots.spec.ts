import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Скриншоты главной и «Финансы» для Den / Sam / Sega (desktop dark).
 * Папка: screenshots/compare/2026-05-09_dashboard-finance-all-roles/
 */
const OUT = "screenshots/compare/2026-05-09_dashboard-finance-all-roles";

test.beforeAll(() => {
  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
});

async function login(
  context: import("@playwright/test").BrowserContext,
  username: string,
  passwords: string[]
) {
  for (const p of passwords) {
    const r = await context.request.post("/api/auth/login", { data: { username, password: p } });
    if (r.ok()) return;
  }
  throw new Error(`login failed: ${username}`);
}

test("dashboard + finance screenshots Den Sam Sega", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("app-dark-mode", "true");
    window.dispatchEvent(new Event("thaiinvest-theme-storage"));
  });

  const denUser = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "Den";
  const denPw = [process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD, process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123", "den123"].filter(
    (p, i, a): p is string => Boolean(p) && a.indexOf(p) === i
  );
  const samPw = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";
  const invUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const invPw = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

  await login(context, denUser, denPw);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-den-dashboard.png`, fullPage: true });
  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-den-finance.png`, fullPage: true });

  await context.request.post("/api/auth/logout");
  await login(context, "Sam", [samPw, "admin123"]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-sam-dashboard.png`, fullPage: true });
  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-sam-finance.png`, fullPage: true });

  await context.request.post("/api/auth/logout");
  await login(context, invUser, [invPw]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".thai-dashboard-root")).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/05-sega-dashboard.png`, fullPage: true });
  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/06-sega-finance.png`, fullPage: true });
});
