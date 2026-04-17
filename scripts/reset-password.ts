import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function resetPassword(username: string, newPassword: string) {
  const hash = bcrypt.hashSync(newPassword, 10)

  const user = await prisma.user.findUnique({
    where: { username },
  })

  if (!user) {
    console.error(`❌ Пользователь "${username}" не найден`)
    return
  }

  await prisma.user.update({
    where: { username },
    data: {
      password: hash,
    },
  })

  console.log(`✅ Пароль для "${username}" обновлён`)
}

async function main() {
  await resetPassword('admin', 'admin123')
  await resetPassword('semen', 'admin123')
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })