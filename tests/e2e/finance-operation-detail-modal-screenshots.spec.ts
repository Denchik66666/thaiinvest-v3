import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Модалка «Карточка операции» на /dashboard/finance — то же окно, что на скрине
 * (заголовок вида «Проценты - …», подзаголовок «Карточка операции»).
 *
 * Скриншоты: screenshots/compare/2026-05-09_finance-operation-detail-modal/
 *
 * Запуск (сервер уже на 3000):
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; $env:PLAYWRIGHT_BASE_URL="http://localhost:3000"; npx playwright test tests/e2e/finance-operation-detail-modal-screenshots.spec.ts
 */
const OUT = "screenshots/compare/2026-05-09_finance-operation-detail-modal";

test.beforeAll(() => {
  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
});

test("finance: лента → модалка карточки операции (скриншоты)", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const invUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const invPw = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

  const login = await context.request.post("/api/auth/login", { data: { username: invUser, password: invPw } });
  expect(login.ok(), await login.text()).toBeTruthy();

  await page.goto("/dashboard/finance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });

  await page.screenshot({ path: path.join(process.cwd(), OUT, "1-finance-feed-before-click.png"), fullPage: true });

  const attentionRow = page.locator('[data-finance-history-attention="action"]').first();
  /** Строка выплаты/пополнения в ленте (клик открывает `FinanceOperationDetailModal`). */
  const paymentLine = page.getByText(/Проценты ·|Вывод тела ·|Пополнение|Закрытие позиции/i).first();

  if (await attentionRow.isVisible().catch(() => false)) {
    await attentionRow.click();
  } else {
    await expect(paymentLine, "В ленте нет операций с подписью выплаты/пополнения").toBeVisible({ timeout: 60_000 });
    await paymentLine.click();
  }

  await expect(page.getByText("Карточка операции", { exact: true })).toBeVisible({ timeout: 30_000 });

  const modalShell = page.locator("div.relative.z-10").filter({ hasText: "Карточка операции" }).first();
  await expect(modalShell).toBeVisible();
  await modalShell.screenshot({ path: path.join(process.cwd(), OUT, "2-operation-detail-modal-panel.png") });
  await page.screenshot({ path: path.join(process.cwd(), OUT, "3-finance-with-modal-fullpage.png"), fullPage: true });
});
