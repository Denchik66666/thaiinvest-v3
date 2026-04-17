import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth";

const prisma = new PrismaClient();

async function ensureUser(
  username: string,
  role: "SUPER_ADMIN" | "OWNER",
  password: string
) {
  const existing = await prisma.user.findUnique({
    where: { username },
  });

  if (existing) {
    console.log(`ℹ️ Пользователь ${username} уже существует`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      password: hashPassword(password),
      role,
    },
  });

  console.log(`✅ Пользователь ${username} создан`);
}

async function main() {
  const password = "admin123";

  await ensureUser("admin", "SUPER_ADMIN", password);
  await ensureUser("semen", "OWNER", password);

  console.log("Пароль для всех пользователей:", password);
}

main()
  .catch((e) => {
    console.error("❌ Ошибка:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });