import { expect, test } from "@playwright/test";

/**
 * Регрессия: после одобрения владельцем инвестор в модалке видит «Принять», даже если строка ленты
 * ещё с устаревшим `item.status` (источник истины — GET /api/payments/context → paymentRowStatus).
 *
 * Сценарий: находим или создаём заявку → Sam одобряет → вход как инвестор → deep link открывает модалку.
 * При отсутствии тела на позиции для тестовой заявки тест пропускается (test.skip).
 */
type PaymentOp = {
  kind: string;
  status: string;
  paymentId: number;
  investorId: number;
};

async function apiLogin(
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

async function findWaitingOrApproveRequested(
  context: import("@playwright/test").BrowserContext
): Promise<{ investorId: number; paymentId: number } | null> {
  const invRes = await context.request.get("/api/investors?network=common&lean=1");
  if (!invRes.ok()) return null;
  const invJson = (await invRes.json()) as { investors?: { id: number }[] };
  const investors = invJson.investors ?? [];
  for (const inv of investors) {
    const hRes = await context.request.get(`/api/investors/operations-history?investorId=${inv.id}`);
    if (!hRes.ok()) continue;
    const hJson = (await hRes.json()) as { items?: PaymentOp[] };
    const items = hJson.items ?? [];
    const waiting = items.find((i) => i.kind === "payment" && i.status === "approved_waiting_accept");
    if (waiting) return { investorId: inv.id, paymentId: waiting.paymentId };
    const req = items.find((i) => i.kind === "payment" && i.status === "requested");
    if (req) {
      const ap = await context.request.post("/api/payments", {
        data: { action: "owner_approve", paymentId: req.paymentId },
      });
      if (ap.ok()) return { investorId: inv.id, paymentId: req.paymentId };
    }
  }
  return null;
}

async function investorPrimaryId(context: import("@playwright/test").BrowserContext): Promise<number | null> {
  const invRes = await context.request.get("/api/investors?network=all&lean=1");
  if (!invRes.ok()) return null;
  const invJson = (await invRes.json()) as { investors?: { id: number }[] };
  const first = invJson.investors?.[0];
  return first?.id ?? null;
}

test("finance modal: инвестор видит «Принять» после одобрения владельца (статус из контекста)", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const samPw = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123";
  const invUser = process.env.PLAYWRIGHT_INVESTOR_USER ?? "Sega_55RUS";
  const invPw = process.env.PLAYWRIGHT_INVESTOR_PASSWORD ?? "qwerty123";

  let target: { investorId: number; paymentId: number } | null = null;

  await apiLogin(context, "Sam", [samPw, "admin123"]);
  target = await findWaitingOrApproveRequested(context);
  await context.request.post("/api/auth/logout");

  if (!target) {
    await apiLogin(context, invUser, [invPw, "qwerty123"]);
    const investorId = await investorPrimaryId(context);
    if (investorId == null) {
      test.skip(true, "Нет позиции у инвестора в /api/investors");
      return;
    }
    const reqRes = await context.request.post("/api/payments", {
      data: { action: "request", investorId, type: "body", amount: 1 },
    });
    if (!reqRes.ok()) {
      test.skip(true, `Не удалось создать тестовую заявку: ${await reqRes.text()}`);
      return;
    }
    const created = (await reqRes.json()) as { payment?: { id: number } };
    const paymentId = created.payment?.id;
    if (paymentId == null) {
      test.skip(true, "Ответ POST /api/payments без payment.id");
      return;
    }
    await context.request.post("/api/auth/logout");

    await apiLogin(context, "Sam", [samPw, "admin123"]);
    const appr = await context.request.post("/api/payments", {
      data: { action: "owner_approve", paymentId },
    });
    if (!appr.ok()) {
      test.skip(true, `OWNER не одобрил заявку: ${await appr.text()}`);
      return;
    }
    target = { investorId, paymentId };
    await context.request.post("/api/auth/logout");
  }

  await apiLogin(context, invUser, [invPw, "qwerty123"]);

  await page.goto(
    `/dashboard/finance?investor=${target.investorId}&payment=${target.paymentId}`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Карточка операции", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Принять" })).toBeVisible({ timeout: 45_000 });
});
