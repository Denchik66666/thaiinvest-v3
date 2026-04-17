import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = process.env.DATABASE_URL
const directUrl = process.env.DIRECT_URL
const usePrismaAccelerate = Boolean(databaseUrl?.startsWith('prisma+postgres://'))

/** Обычный Postgres URI (не prisma+) — для PrismaPg. */
function isDirectPostgresUrl(url: string | undefined): url is string {
  if (!url) return false
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
}

function createPrismaClient(): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  // Accelerate в Prisma 7 не даёт смешивать с adapter; часть записей (updateMany и т.д.)
  // надёжнее гонять по прямому Postgres. Если есть DIRECT_URL — используем его для всего клиента.
  if (usePrismaAccelerate && isDirectPostgresUrl(directUrl)) {
    return new PrismaClient({ adapter: new PrismaPg(directUrl) })
  }
  if (usePrismaAccelerate) {
    return new PrismaClient({ accelerateUrl: databaseUrl })
  }
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = prisma
