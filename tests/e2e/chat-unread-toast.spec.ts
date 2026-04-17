import { test, expect } from "@playwright/test";

const adminUser = process.env.E2E_ADMIN_USER ?? "admin";
const adminPass = process.env.E2E_ADMIN_PASSWORD ?? "admin123";
const ownerUser = process.env.E2E_OWNER_USER ?? "semen";
const ownerPass = process.env.E2E_OWNER_PASSWORD ?? "admin123";

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-username").fill(username);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("Чат: непрочитанные и всплывающее уведомление", () => {
  test("на главной у SUPER_ADMIN появляется toast после сообщения от OWNER", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const ownerCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const ownerPage = await ownerCtx.newPage();

    await login(adminPage, adminUser, adminPass);
    await login(ownerPage, ownerUser, ownerPass);

    await adminPage.goto("/dashboard");
    await expect(adminPage).not.toHaveURL(/\/dashboard\/chat/);

    const adminId = await ownerPage.evaluate(async () => {
      const res = await fetch("/api/chat/directory", { credentials: "include" });
      const data = (await res.json()) as {
        success?: boolean;
        users?: Array<{ id: number; username: string; role: string }>;
      };
      if (!data.users?.length) return null;
      const adminRow =
        data.users.find((u) => u.role === "SUPER_ADMIN") ?? data.users.find((u) => u.username === "admin");
      return adminRow?.id ?? null;
    });

    expect(adminId, "В каталоге чата OWNER должен видеть SUPER_ADMIN (после seed admin/semen)").not.toBeNull();

    const body = `E2E toast ${Date.now()}`;
    const sendRes = await ownerPage.evaluate(
      async ({ recipientId, messageBody }) => {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, body: messageBody }),
        });
        return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
      },
      { recipientId: adminId!, messageBody: body }
    );
    expect(sendRes.ok, JSON.stringify(sendRes)).toBeTruthy();

    const toast = adminPage.locator("[data-sonner-toast]").filter({ hasText: /Новое сообщение|Новых сообщений/ });
    await expect(toast.first()).toBeVisible({ timeout: 45_000 });
    await expect(toast.first()).toContainText(body.slice(0, 24));

    await adminCtx.close();
    await ownerCtx.close();
  });
});
