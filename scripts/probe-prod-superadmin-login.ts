/**
 * Проверка пароля SUPER_ADMIN на проде (только .env). Не печатает пароль.
 * npx tsx scripts/probe-prod-superadmin-login.ts
 */
import "./load-prod-env-only";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "../lib/prisma";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function fromEnvFiles(...keys: string[]): string | undefined {
  const merged: Record<string, string> = {};
  for (const f of [".env", ".env.local"]) {
    const fp = path.join(root, f);
    if (fs.existsSync(fp)) Object.assign(merged, dotenv.parse(fs.readFileSync(fp, "utf8")));
  }
  for (const k of keys) {
    const v = merged[k]?.trim();
    if (v) return v;
  }
  return process.env[keys[0]]?.trim();
}

const candidates = [
  fromEnvFiles("PLAYWRIGHT_SUPERADMIN_PASSWORD", "PLAYWRIGHT_DEN_PASSWORD"),
  fromEnvFiles("PLAYWRIGHT_LOGIN_PASSWORD"),
  "admin123",
  "qwerty123",
].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isArchived: false },
    select: { id: true, username: true, password: true },
  });
  if (!user) {
    console.error("SUPER_ADMIN не найден");
    process.exit(1);
  }
  console.log(`SUPER_ADMIN: id=${user.id} username="${user.username}"`);

  let matched: string | null = null;
  for (const p of candidates) {
    if (bcrypt.compareSync(p, user.password)) {
      matched = p;
      break;
    }
  }
  if (!matched) {
    console.log("Локальные кандидаты не совпали с хешем в прод-БД.");
    process.exit(2);
  }
  console.log(`Пароль совпал с одним из известных кандидатов (длина ${matched.length}).`);

  const base = process.env.PLAYWRIGHT_BASE_URL ?? "https://thaiinvest-v3.vercel.app";
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.username, password: matched }),
  });
  console.log(`POST ${base}/api/auth/login → ${res.status}`);
  if (!res.ok) {
    console.error(await res.text());
    process.exit(3);
  }
  console.log("OK: вход на проде с этим username/password работает.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
