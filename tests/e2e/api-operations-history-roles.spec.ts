import { expect, test, type Browser } from "@playwright/test";

/**
 * Контракт GET /api/investors/operations-history по ролям.
 * PLAYWRIGHT_BASE_URL / PLAYWRIGHT_SKIP_WEBSERVER — как в прочих API/e2e спеках.
 */
const CREDS = {
  owner: { u: "Sam", p: "admin123" },
  investor: { u: "Sega_55RUS", p: "qwerty123" },
  admin: { u: "admin", p: "admin123" },
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

test("GET /api/investors/operations-history — INVESTOR, OWNER и SUPER_ADMIN 200", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const b = baseURL ?? "http://127.0.0.1:3000";

  const investorCtx = await newContextWithLogin(browser, b, CREDS.investor.u, CREDS.investor.p);
  const invRes = await investorCtx.request.get("/api/investors/operations-history");
  expect(invRes.status()).toBe(200);
  const invJson = (await invRes.json()) as { items?: unknown };
  expect(Array.isArray(invJson.items)).toBe(true);

  const ownerCtx = await newContextWithLogin(browser, b, CREDS.owner.u, CREDS.owner.p);
  const ownerRes = await ownerCtx.request.get("/api/investors/operations-history");
  expect(ownerRes.status()).toBe(200);
  const ownerJson = (await ownerRes.json()) as { items?: unknown };
  expect(Array.isArray(ownerJson.items)).toBe(true);

  const adminCtx = await newContextWithLogin(browser, b, CREDS.admin.u, CREDS.admin.p);
  const adminRes = await adminCtx.request.get("/api/investors/operations-history");
  expect(adminRes.status()).toBe(200);
  const adminJson = (await adminRes.json()) as { items?: unknown };
  expect(Array.isArray(adminJson.items)).toBe(true);

  await investorCtx.close();
  await ownerCtx.close();
  await adminCtx.close();
});
