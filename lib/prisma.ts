import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = process.env.DATABASE_URL
const usePrismaAccelerate = Boolean(databaseUrl?.startsWith('prisma+postgres://'))

function createPrismaClient(): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  if (usePrismaAccelerate) {
    return new PrismaClient({ accelerateUrl: databaseUrl })
  }
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = prisma
