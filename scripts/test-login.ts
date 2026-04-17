import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function test() {
  const user = await prisma.user.findUnique({
    where: { username: 'admin' },
  })

  if (!user) {
    console.log('❌ user not found')
    return
  }

  console.log('✅ user found:', user.username)

  const ok = bcrypt.compareSync('admin123', user.password)
  console.log('bcrypt compare result:', ok)
}

;(async () => {
  try {
    await test()
  } catch (e) {
    console.error('❌ error:', e)
  } finally {
    await prisma.$disconnect()
  }
})()