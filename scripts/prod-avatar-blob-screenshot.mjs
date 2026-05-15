/**
 * Prod smoke: login → upload avatar via Blob API → screenshot topbar with photo.
 * Usage: npm run smoke:prod:avatar
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://thaiinvest-v3.vercel.app";
const OUT_DIR = "screenshots/compare/2026-05-15_prod-avatar-blob";
const OUT_FILE = path.join(OUT_DIR, "prod-avatar-working.png");

const USER =
  process.env.PLAYWRIGHT_SUPERADMIN_USER ??
  process.env.PLAYWRIGHT_LOGIN_USER ??
  process.env.PLAYWRIGHT_OWNER_USER ??
  "Den";
const PASS =
  process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD ??
  process.env.PLAYWRIGHT_LOGIN_PASSWORD ??
  process.env.PLAYWRIGHT_OWNER_PASSWORD ??
  "admin123";

/** 64×64 orange PNG (valid JPEG would work too; PNG is distinctive in preview). */
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAIklEQVR4nO3BMQEAAADCoPVP7WsIoAAAAAAAAAAAeAN1+AABf8h6iQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const tmpPng = path.join(OUT_DIR, "_test-avatar.png");
  await writeFile(tmpPng, TEST_PNG);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE });
  const loginRes = await context.request.post("/api/auth/login", {
    data: { username: USER, password: PASS },
  });
  if (!loginRes.ok()) {
    throw new Error(`Login failed ${loginRes.status()}: ${await loginRes.text()}`);
  }

  const uploadRes = await context.request.post("/api/auth/avatar", {
    multipart: {
      file: {
        name: "prod-smoke-avatar.png",
        mimeType: "image/png",
        buffer: TEST_PNG,
      },
    },
  });
  const uploadBody = await uploadRes.text();
  if (!uploadRes.ok()) {
    throw new Error(`Avatar upload failed ${uploadRes.status()}: ${uploadBody}`);
  }
  const parsed = JSON.parse(uploadBody);
  if (!parsed.avatarUrl?.includes("blob.vercel-storage.com")) {
    throw new Error(`avatarUrl is not Vercel Blob: ${parsed.avatarUrl}`);
  }
  console.log("OK upload:", parsed.avatarUrl);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard", { waitUntil: "load", timeout: 120_000 });
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });

  const topbar = page.locator(".thai-dashboard-sticky-bar").first();
  await topbar.waitFor({ state: "visible", timeout: 120_000 });

  const avatarImg = topbar.locator('img[src*="blob.vercel-storage.com"]');
  await avatarImg.waitFor({ state: "visible", timeout: 60_000 });

  await page.waitForTimeout(800);
  await topbar.screenshot({ path: OUT_FILE });
  console.log("Screenshot:", OUT_FILE);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
