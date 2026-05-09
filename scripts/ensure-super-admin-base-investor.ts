/**
 * Создаёт базовую инвесторскую позицию SUPER_ADMIN в общей сети (isPrivate=false),
 * если её нет. Новых пользователей НЕ создаёт.
 *
 * Важно: SUPER_ADMIN определяется по роли (role=SUPER_ADMIN, isArchived=false).
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isArchived: false },
    select: { id: true, username: true },
  });
  if (!admin) throw new Error("Нет SUPER_ADMIN пользователя (role=SUPER_ADMIN).");

  const existing = await prisma.investor.findFirst({
    where: { isPrivate: false, OR: [{ ownerId: admin.id }, { linkedUserId: admin.id }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) {
    console.log("OK: базовый инвестор SUPER_ADMIN уже есть:", existing.id);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inv = await prisma.investor.create({
    data: {
      ownerId: admin.id,
      linkedUserId: admin.id,
      investorUserId: null,
      name: admin.username,
      body: 1,
      rate: 0.01,
      accrued: 0,
      paid: 0,
      entryDate: today,
      activationDate: today,
      status: "active",
      isPrivate: false,
      isSystemOwner: true,
    },
    select: { id: true, ownerId: true, linkedUserId: true, isPrivate: true, name: true },
  });
  console.log("CREATED: базовый инвестор SUPER_ADMIN:", inv);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

