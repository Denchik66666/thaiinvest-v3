import { test } from "@playwright/test";

/**
 * Дамп computed color для метрик на главной и истории (раздел «История операций»).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test tests/e2e/finance-computed-colors-dump.spec.ts
 */
const loginUser = process.env.PLAYWRIGHT_LOGIN_USER ?? "Sega_55RUS";
const loginPassword = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "qwerty123";

test("dump finance page computed colors", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const loginRes = await context.request.post("/api/auth/login", {
    data: { username: loginUser, password: loginPassword },
  });
  if (!loginRes.ok()) test.skip(true, `login failed: ${await loginRes.text()}`);

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /История операций/i }).click().catch(() => {});
  await page.waitForTimeout(600);

  const dump = await page.evaluate(() => {
    const c = (el: Element | null | undefined) =>
      el && el instanceof HTMLElement ? window.getComputedStyle(el).color : null;

    const out: Record<string, { text: string; color: string | null; inline: string | null }> = {};

    const heroTiles = Array.from(document.querySelectorAll(".thai-stat-tile"));
    heroTiles.forEach((tile, i) => {
      const span = tile.querySelector("span.font-semibold.tabular-nums");
      const text = (tile.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      out[`hero_tile_${i}`] = {
        text,
        color: c(span),
        inline: span instanceof HTMLElement ? span.getAttribute("style") : null,
      };
    });

    const posButtons = Array.from(document.querySelectorAll("[role=\"button\"].thai-row-interactive"));
    posButtons.forEach((btn, bi) => {
      const spans = btn.querySelectorAll("span.font-semibold.tabular-nums");
      spans.forEach((span, si) => {
        const key = `position_${bi}_value_${si}`;
        out[key] = {
          text: (span.textContent ?? "").trim(),
          color: c(span),
          inline: span instanceof HTMLElement ? span.getAttribute("style") : null,
        };
      });
    });

    const histAcc = document.querySelector("[data-finance-history=\"accrued\"]");
    if (histAcc) {
      out.history_accrued_first = {
        text: (histAcc.textContent ?? "").replace(/\u00a0/g, " ").trim().slice(0, 40),
        color: c(histAcc),
        inline: histAcc instanceof HTMLElement ? histAcc.getAttribute("style") : null,
      };
    }

    return out;
  });

  process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
});
