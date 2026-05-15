import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
import { hashPassword } from "../lib/auth";
import type { Role } from "@prisma/client";

/**
 * Seed (локальная разработка) — НЕ должен плодить пользователей при смене ника.
 *
 * Вместо upsert'ов по фиксированным usernames:
 * - SUPER_ADMIN: создаём `Den` только если нет ни одного SUPER_ADMIN
 * - OWNER: создаём Sam только если нет ни одного OWNER
 * - INVESTOR: создаём Sega_55RUS только если нет ни одного INVESTOR
 *
 * Пароли для создаваемых seed'ом пользователей:
 * - Den (SUPER_ADMIN): admin123
 * - Sam (OWNER): admin123
 * - Sega_55RUS (INVESTOR): qwerty123
 */

const PW = {
  Den: "admin123",
  Sam: "admin123",
  Sega_55RUS: "qwerty123",
} as const;

function allowCreate(): boolean {
  return process.env.SEED_ALLOW_CREATE === "1";
}

async function createUser(username: string, role: Role, password: string) {
  const { prisma } = await import("../lib/prisma");
  const hashed = hashPassword(password);
  return await prisma.user.create({
    data: { username, role, password: hashed, isArchived: false, archivedAt: null },
    select: { id: true, username: true, role: true },
  });
}

async function ensureRole(role: Role, fallbackUsername: string, fallbackPassword: string) {
  const { prisma } = await import("../lib/prisma");
  const existing = await prisma.user.findFirst({
    where: { role, isArchived: false },
    select: { id: true, username: true },
  });
  if (existing) return existing;
  if (!allowCreate()) {
    throw new Error(
      `Нет пользователя роли ${role}. Создание запрещено (SEED_ALLOW_CREATE!=1). Создайте вручную или запустите seed с SEED_ALLOW_CREATE=1.`
    );
  }
  const created = await createUser(fallbackUsername, role, fallbackPassword);
  console.log(`✅ ${role} создан:`, created);
  return { id: created.id, username: created.username };
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const superAdmin = await ensureRole("SUPER_ADMIN", "Den", PW.Den);
  const owner = await ensureRole("OWNER", "Sam", PW.Sam);
  const investorUser = await ensureRole("INVESTOR", "Sega_55RUS", PW.Sega_55RUS);

  // Тестовая инвесторская позиция: привязать инвестора к owner, если ещё нет.
  const linked = await prisma.investor.findFirst({
    where: { investorUserId: investorUser.id },
    select: { id: true, ownerId: true },
  });

  if (!linked) {
    if (!allowCreate()) {
      throw new Error(
        `Нет инвесторской позиции для ${investorUser.username}. Создание запрещено (SEED_ALLOW_CREATE!=1). Создайте позицию вручную или запустите seed с SEED_ALLOW_CREATE=1.`
      );
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.investor.create({
      data: {
        ownerId: owner.id,
        investorUserId: investorUser.id,
        name: investorUser.username,
        body: 1,
        rate: 0.01,
        accrued: 0,
        paid: 0,
        entryDate: today,
        activationDate: today,
        status: "active",
        isPrivate: false,
      },
    });
    console.log(`✅ Инвесторская позиция для ${investorUser.username} (OWNER: ${owner.username}) создана`);
  } else if (linked.ownerId !== owner.id) {
    await prisma.investor.update({
      where: { id: linked.id },
      data: { ownerId: owner.id },
    });
    console.log(`✅ Позиция ${investorUser.username} привязана к OWNER ${owner.username}`);
  }

  // Для диагностик.
  const roleCounts = await prisma.user.groupBy({
    by: ["role"],
    where: { isArchived: false },
    _count: { id: true },
  });
  console.log("Пользователи по ролям (не archived):", roleCounts);
  console.log("Primary users:", { superAdmin, owner, investorUser });
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../lib/prisma");
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
