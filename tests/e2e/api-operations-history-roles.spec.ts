import { expect, test, type Browser } from "@playwright/test";

import type { OperationsHistoryResponse } from "../../types/operations-finance-api";

/**
 * Контракт GET /api/investors/operations-history по ролям.
 * PLAYWRIGHT_BASE_URL / PLAYWRIGHT_SKIP_WEBSERVER — как в прочих API/e2e спеках.
 */
function assertOperationsHistoryResponse(body: unknown): asserts body is OperationsHistoryResponse {
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  const o = body as OperationsHistoryResponse;
  expect(Array.isArray(o.items)).toBe(true);
  if (o.meta != null && o.meta.investorSelection != null) {
    const p = o.meta.investorSelection.investorPositions;
    expect(typeof p.moreAvailable).toBe("boolean");
    expect(typeof p.included).toBe("number");
    expect(typeof p.limit).toBe("number");
    expect(p.orderBy).toBe("updatedAt_desc");
    expect(p.included).toBeLessThanOrEqual(p.limit);
  }
}
/** Пароли из `prisma/seed.ts` (локальная разработка). SUPER_ADMIN — отдельный тест с env. */
const CREDS = {
  owner: { u: "Sam", p: "admin123" },
  investor: { u: "Sega_55RUS", p: "qwerty123" },
} as const;

async function newContextWithLogin(browser: Browser, baseURL: string, u: string, p: string) {
  const ctx = await browser.newContext({ baseURL });
  const loginRes = await ctx.request.post("/api/auth/login", { data: { username: u, password: p } });
  if (!loginRes.ok()) {
    const t = await loginRes.text();
    await ctx.close();
    throw new Error(`Login failed ${loginRes.status()}: ${t}`);
  }
  return ctx;
}

test("GET /api/investors/operations-history — INVESTOR и OWNER 200", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  const investorCtx = await newContextWithLogin(browser, b, CREDS.investor.u, CREDS.investor.p);
  const invRes = await investorCtx.request.get("/api/investors/operations-history");
  expect(invRes.status()).toBe(200);
  const invJson = await invRes.json();
  assertOperationsHistoryResponse(invJson);

  const ownerCtx = await newContextWithLogin(browser, b, CREDS.owner.u, CREDS.owner.p);
  const ownerRes = await ownerCtx.request.get("/api/investors/operations-history");
  expect(ownerRes.status()).toBe(200);
  const ownerJson = await ownerRes.json();
  assertOperationsHistoryResponse(ownerJson);

  await investorCtx.close();
  await ownerCtx.close();
});

test("GET /api/investors/operations-history?network=all — SUPER_ADMIN: meta и заголовок при усечении", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const password =
    process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ??
    process.env.SUPERADMIN_PASSWORD ??
    process.env.PLAYWRIGHT_LOGIN_PASSWORD ??
    process.env.PLAYWRIGHT_DEN_PASSWORD;
  test.skip(!password, "Задайте пароль супера в .env (PLAYWRIGHT_LOGIN_PASSWORD и т.п.)");

  const b = baseURL ?? "http://127.0.0.1:3000";
  const user = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "Den";
  const ctx = await newContextWithLogin(browser, b, user, password!);
  try {
    const res = await ctx.request.get("/api/investors/operations-history?network=all", { timeout: 150_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    assertOperationsHistoryResponse(body);

    const hdr = res.headers();
    const partial =
      hdr["x-thaiinvest-investor-selection-partial"] ?? hdr["X-Thaiinvest-Investor-Selection-Partial"];

    if (body.meta?.investorSelection?.investorPositions.moreAvailable) {
      expect(partial).toBe("1");
    }
  } finally {
    await ctx.close();
  }
});
