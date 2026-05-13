/**
 * Vercel build entry: Preview часто без DATABASE_URL — migrate deploy пропускаем.
 * Production на Vercel и локальный запуск npm run build:vercel — миграции выполняются.
 */
import { spawnSync } from "node:child_process";

function sh(cmd) {
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: process.cwd() });
  const code = r.status ?? 1;
  if (code !== 0) process.exit(code);
}

sh("npx prisma generate");

const onVercel = process.env.VERCEL === "1";
const vercelEnv = process.env.VERCEL_ENV || "";
const skipMigrate = onVercel && (vercelEnv === "preview" || vercelEnv === "development");

if (!skipMigrate) {
  sh("npx prisma migrate deploy");
}

sh("npx next build");
