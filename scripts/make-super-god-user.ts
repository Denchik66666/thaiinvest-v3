/**
 * Делает существующего SUPER_ADMIN "богом" под нужным логином/паролем,
 * НЕ создавая новых пользователей.
 *
 * По умолчанию:
 * - username: Den
 * - password: admin123
 *
 * Можно переопределить:
 *   GOD_USERNAME=... GOD_PASSWORD=...
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { hashPassword } from "../lib/auth";

async function main() {
  const username = (process.env.GOD_USERNAME ?? "Den").trim();
  const password = process.env.GOD_PASSWORD ?? "admin123";
  if (!username) throw new Error("GOD_USERNAME empty");
  if (!password) throw new Error("GOD_PASSWORD empty");

  const { prisma } = await import("../lib/prisma");

  const existingAdmin = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" }, isArchived: false },
    select: { id: true, username: true, role: true },
  });
  if (existingAdmin && existingAdmin.role !== "SUPER_ADMIN") {
    throw new Error(
      `Уже есть пользователь ${existingAdmin.username} (id=${existingAdmin.id}, role=${existingAdmin.role}). ` +
        `Не трогаю, чтобы не сломать аккаунт. Укажи другой GOD_USERNAME.`
    );
  }

  const god = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isArchived: false },
    select: { id: true, username: true },
  });
  if (!god) throw new Error("В базе нет SUPER_ADMIN");

  const updated = await prisma.user.update({
    where: { id: god.id },
    data: { username, password: hashPassword(password), role: "SUPER_ADMIN", isArchived: false, archivedAt: null },
    select: { id: true, username: true, role: true },
  });

  console.log("OK super user:", updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

