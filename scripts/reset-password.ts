import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function resetPassword(username: string, newPassword: string) {
  const hash = bcrypt.hashSync(newPassword, 10)

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  })

  if (!user) {
    console.error(`❌ Пользователь "${username}" не найден`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hash,
      isArchived: false,
      archivedAt: null,
    },
  })

  console.log(`✅ Пароль для "${user.username}" обновлён`)
}

async function main() {
  await resetPassword('admin', 'admin123')
  await resetPassword('Den', 'admin123')
  await resetPassword('Sam', 'admin123')
  await resetPassword('Sega_55RUS', 'qwerty123')
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })