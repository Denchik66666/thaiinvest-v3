import { expect, test } from "@playwright/test";

/**
 * Визуальная проверка /dashboard/manage для OWNER (Sam) и SUPER_ADMIN (Den после переименования admin).
 * Скриншоты: test-results/manage-smoke-{Sam|Den}.png
 */
/** Sam: `admin123`. Den: в проекте — `admin123`; иначе seed `den123` или `PLAYWRIGHT_SUPERADMIN_PASSWORD`. */
const samCase = {
  label: "Sam" as const,
  username: "Sam",
  passwords: [process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123"],
};
const denUsername = process.env.PLAYWRIGHT_SUPERADMIN_USER ?? "Den";
const denPasswords = [
  process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD,
  process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "admin123",
  "den123",
].filter((p, i, a): p is string => Boolean(p) && a.indexOf(p) === i);

for (const { label, username, passwords } of [samCase, { label: "Den" as const, username: denUsername, passwords: denPasswords }]) {
  test(`manage page smoke (${label})`, async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    let loginRes = await context.request.post("/api/auth/login", {
      data: { username, password: passwords[0] },
    });
    for (let i = 1; !loginRes.ok() && i < passwords.length; i += 1) {
      loginRes = await context.request.post("/api/auth/login", {
        data: { username, password: passwords[i] },
      });
    }
    expect(loginRes.ok(), `login ${label} ${loginRes.status()}`).toBeTruthy();

    await page.goto("/dashboard/manage", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Управление" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Ставка сети", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Создать инвестора" })).toBeVisible({ timeout: 15_000 });
    if (label === "Den") {
      await expect(page.getByText("Сеть платформы", { exact: false })).toBeVisible();
      await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    }

    await page.screenshot({ path: `test-results/manage-smoke-${label}.png`, fullPage: true });
  });
}
