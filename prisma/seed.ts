import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { Role } from "@prisma/client";

async function main() {
  const users = [
    {
      username: "admin",
      password: "admin123",
      role: "SUPER_ADMIN",
    },
    {
      username: "semen",
      password: "admin123",
      role: "OWNER",
    },
    {
      username: "Sega",
      password: "admin123",
      role: "INVESTOR",
    },
  ];

  for (const user of users) {
    const exists = await prisma.user.findUnique({
      where: { username: user.username },
    });

    if (!exists) {
      await prisma.user.create({
        data: {
          username: user.username,
          password: hashPassword(user.password),
          role: user.role as Role,
        },
      });

      console.log(`✅ Пользователь ${user.username} создан`);
    } else {
      console.log(`ℹ️ Пользователь ${user.username} уже существует`);
    }
  }

  const owner = await prisma.user.findFirst({
    where: { username: "semen", role: "OWNER", isArchived: false },
    select: { id: true },
  });
  const sega = await prisma.user.findFirst({
    where: { username: "Sega", isArchived: false },
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
          name: "Sega",
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
      console.log("✅ Инвесторская позиция для Sega (чат с владельцем сети) создана");
    } else {
      console.log("ℹ️ У Sega уже есть позиция инвестора");
    }
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