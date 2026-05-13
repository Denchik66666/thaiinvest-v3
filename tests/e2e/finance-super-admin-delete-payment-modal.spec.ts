/**
 * Дымовой сценарий: SUPER_ADMIN удаляет заявку через модалку «Финансы» (подтверждение AppDialogs).
 *
 * Деструктивный тест: реально удаляет последнюю по sortAt операцию payment с заданной суммой.
 *
 * Окружение:
 *   PLAYWRIGHT_BASE_URL / PLAYWRIGHT_SKIP_WEBSERVER — как в прочих e2e.
 *   Пароль: PLAYWRIGHT_SUPERADMIN_PASSWORD | PLAYWRIGHT_DEN_PASSWORD | PLAYWRIGHT_LOGIN_PASSWORD | SUPERADMIN_PASSWORD | по умолчанию admin123 (локальный seed).
 *   Пользователь: PLAYWRIGHT_SUPERADMIN_USER (по умолчанию admin).
 *   Сумма для поиска: PLAYWRIGHT_FINANCE_DELETE_AMOUNT (по умолчанию 200).
 *   Только дата 05.05 в sortAt/createdAt: PLAYWRIGHT_FINANCE_DELETE_MAY5=1 (среди payment с нужной суммой).
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import type { FinanceOperationItem } from "../../types/finance-operations";

function moneyRound2(n: number): number {
  return Math.round(n * 100) / 100;
}

function superAdminPassword(): string {
  return (
    process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ??
    process.env.PLAYWRIGHT_DEN_PASSWORD ??
    process.env.PLAYWRIGHT_LOGIN_PASSWORD ??
    process.env.SUPERADMIN_PASSWORD ??
    "admin123"
  );
}

async function newLoggedInSuperAdminContext(browser: Browser, baseURL: string, password: string): Promise<BrowserContext> {
  const user = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "admin";
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: user, password } });
  const loginText = await loginRes.text();
  if (!loginRes.ok()) {
    await ctx.close();
    throw new Error(`SUPER_ADMIN login ${loginRes.status()}: ${loginText.slice(0, 500)}`);
  }
  const me = await ctx.request.get("/api/auth/me", { timeout: 30_000 });
  const meText = await me.text();
  const body = JSON.parse(meText) as { user?: { role?: string } };
  if (body.user?.role !== "SUPER_ADMIN") {
    await ctx.close();
    throw new Error(`Ожидали SUPER_ADMIN для ${user}, получили ${body.user?.role ?? "?"}`);
  }
  return ctx;
}

test.describe("SUPER_ADMIN: удаление операции через модалку финансов", () => {
  test("модалка → подтверждение «Удалить» → записи нет в operations-history", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const password = superAdminPassword();

    const b = baseURL ?? "http://127.0.0.1:3000";
    const amountTarget = Number(process.env.PLAYWRIGHT_FINANCE_DELETE_AMOUNT ?? "200");
    test.skip(!Number.isFinite(amountTarget), "PLAYWRIGHT_FINANCE_DELETE_AMOUNT некорректен");

    const ctx = await newLoggedInSuperAdminContext(browser, b, password);
    try {
      const histRes = await ctx.request.get("/api/investors/operations-history?network=all", {
        timeout: 150_000,
      });
      const histText = await histRes.text();
      expect(histRes.ok(), histText.slice(0, 500)).toBeTruthy();
      const hist = JSON.parse(histText) as { items: FinanceOperationItem[] };

      const payments = hist.items.filter(
        (i): i is Extract<FinanceOperationItem, { kind: "payment" }> =>
          i.kind === "payment" && moneyRound2(i.amount) === moneyRound2(amountTarget)
      );
      const may5Only = process.env.PLAYWRIGHT_FINANCE_DELETE_MAY5 === "1";
      const isMay5 = (iso: string) => iso.includes("-05-05");
      const pool = may5Only
        ? payments.filter((p) => isMay5(p.sortAt) || isMay5(p.createdAt))
        : payments;
      pool.sort((a, x) => (a.sortAt < x.sortAt ? 1 : -1));
      const target = pool[0] ?? null;
      test.skip(
        !target,
        may5Only
          ? `Нет payment ${amountTarget} с датой 05.05 (sortAt/createdAt) — пропуск`
          : `Нет операции kind=payment с суммой ${amountTarget} в доступной сети SUPER_ADMIN — пропуск`
      );

      const { paymentId, investorId } = target;

      const page = await ctx.newPage();
      await page.goto(`/dashboard/finance?investor=${investorId}&payment=${paymentId}`);

      await page.getByRole("button", { name: "Удалить операцию" }).click();

      const confirmDialog = page.getByRole("dialog", { name: "Удалить операцию?" });
      await expect(confirmDialog).toBeVisible();
      const tApply = Date.now();
      await confirmDialog.getByRole("button", { name: "Удалить" }).click();

      await expect(page.getByRole("button", { name: "Удалить операцию" })).toHaveCount(0, { timeout: 60_000 });
      // eslint-disable-next-line no-console
      console.log(`[finance-delete-modal] UI применилось (кнопка «Удалить операцию» исчезла) за ${Date.now() - tApply}ms`);

      const histAfter = await ctx.request.get(
        `/api/investors/operations-history?network=all&investorId=${investorId}`,
        { timeout: 150_000 }
      );
      const histAfterText = await histAfter.text();
      expect(histAfter.ok(), histAfterText.slice(0, 500)).toBeTruthy();
      const dataAfter = JSON.parse(histAfterText) as { items: FinanceOperationItem[] };
      const stillThere = dataAfter.items.some((i) => i.kind === "payment" && i.paymentId === paymentId);
      expect(stillThere).toBe(false);

      await page.close();
    } finally {
      await ctx.close();
    }
  });
});
