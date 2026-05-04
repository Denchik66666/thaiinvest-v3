import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { Role } from "@prisma/client";

/**
 * Пароли по умолчанию (локальная разработка):
 * - admin (SUPER_ADMIN): admin123
 * - Sam (OWNER): admin123
 * - Sega_55RUS (INVESTOR): qwerty123
 */

async function main() {
  const PW = {
    admin: "admin123",
    Sam: "admin123",
    Sega_55RUS: "qwerty123",
  } as const;

  async function upsertUser(username: string, role: Role, password: string) {
    const hashed = hashPassword(password);
    await prisma.user.upsert({
      where: { username },
      create: { username, role, password: hashed },
      update: { role, password: hashed, isArchived: false, archivedAt: null },
    });
  }

  await upsertUser("admin", "SUPER_ADMIN", PW.admin);
  await upsertUser("Sam", "OWNER", PW.Sam);
  await upsertUser("Sega_55RUS", "INVESTOR", PW.Sega_55RUS);

  const sam = await prisma.user.findUniqueOrThrow({ where: { username: "Sam" } });
  const semen = await prisma.user.findUnique({ where: { username: "semen" } });

  if (semen) {
    if (semen.id !== sam.id) {
      await prisma.investor.updateMany({ where: { ownerId: semen.id }, data: { ownerId: sam.id } });
      await prisma.bodyTopUpRequest.updateMany({
        where: { createdById: semen.id },
        data: { createdById: sam.id },
      });
      await prisma.bodyTopUpRequest.updateMany({
        where: { decidedById: semen.id },
        data: { decidedById: sam.id },
      });
      await prisma.rateHistory.updateMany({ where: { changedBy: semen.id }, data: { changedBy: sam.id } });
      await prisma.auditLog.updateMany({ where: { userId: semen.id }, data: { userId: sam.id } });
      await prisma.investor.updateMany({ where: { linkedUserId: semen.id }, data: { linkedUserId: null } });
    }
    await prisma.user.delete({ where: { id: semen.id } });
    console.log("✅ Пользователь semen удалён; при необходимости записи перенесены на Sam");
  } else {
    console.log("ℹ️ Пользователь semen отсутствует");
  }

  const owner = await prisma.user.findFirst({
    where: { username: "Sam", role: "OWNER", isArchived: false },
    select: { id: true },
  });
  const sega = await prisma.user.findFirst({
    where: { username: "Sega_55RUS", isArchived: false },
    select: { id: true },
  });
  if (owner && sega) {
    const linked = await prisma.investor.findFirst({
      where: { investorUserId: sega.id },
      select: { id: true },
    });
    if (!linked) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.investor.create({
        data: {
          ownerId: owner.id,
          investorUserId: sega.id,
          name: "Sega_55RUS",
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
      console.log("✅ Инвесторская позиция для Sega_55RUS (владелец сети Sam) создана");
    } else {
      const inv = await prisma.investor.findFirst({
        where: { investorUserId: sega.id },
        select: { id: true, ownerId: true },
      });
      if (inv && inv.ownerId !== owner.id) {
        await prisma.investor.update({
          where: { id: inv.id },
          data: { ownerId: owner.id },
        });
        console.log("✅ Позиция Sega_55RUS привязана к владельцу Sam");
      } else {
        console.log("ℹ️ У Sega_55RUS уже есть позиция инвестора");
      }
    }
  }

  const roleCounts = await prisma.user.groupBy({
    by: ["role"],
    where: { isArchived: false },
    _count: { id: true },
  });
  console.log("Пользователи по ролям (не archived):", roleCounts);

  const owners = await prisma.user.findMany({
    where: { role: "OWNER", isArchived: false },
    select: { id: true, username: true },
  });
  if (owners.length !== 1 || owners[0]?.username !== "Sam") {
    console.warn("⚠️ Ожидался единственный OWNER с логином Sam. Сейчас:", owners);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
