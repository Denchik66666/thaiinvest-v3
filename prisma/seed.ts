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
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });