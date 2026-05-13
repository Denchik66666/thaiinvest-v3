import { expect, test } from "@playwright/test";

/**
 * Скриншот главной инвестора (/dashboard) после логина (учётка из env или Sega_55RUS).
 * Запуск при dev на :3000:
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER="1"; $env:PLAYWRIGHT_BASE_URL="http://localhost:3000"; npx playwright test tests/e2e/finance-colors-screenshot.spec.ts
 */
const loginUser = process.env.PLAYWRIGHT_LOGIN_USER ?? "Sega_55RUS";
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "qwerty123";

test("finance page metric colors screenshot", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const loginRes = await context.request.post("/api/auth/login", {
    data: { username: loginUser, password: loginPassword },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`Login failed ${loginRes.status()}: ${body}`);
  }

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("Доступно к выводу", { exact: false })).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: "test-results/finance-page-metrics.png", fullPage: true });

  const samples = await page.evaluate(() => {
    const labels = ["Тело", "Начислено", "Выплачено", "К выплате"] as const;
    const out: Record<string, string> = {};
    const tiles = Array.from(document.querySelectorAll(".thai-stat-tile"));
    for (const label of labels) {
      const tile = tiles.find((el) => (el.textContent ?? "").includes(label));
      const span = tile?.querySelector("span.font-semibold.tabular-nums");
      if (span instanceof HTMLElement) out[label] = window.getComputedStyle(span).color;
    }
    return out;
  });

  expect(samples["Начислено"]).toBe("rgb(96, 165, 250)");
  expect(samples["Выплачено"]).toBe("rgb(74, 222, 128)");
  expect(samples["Тело"]).toBe("rgb(255, 255, 255)");
});
