import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = process.env.DATABASE_URL
const usePrismaAccelerate = Boolean(databaseUrl?.startsWith('prisma+postgres://'))

export const prisma = globalForPrisma.prisma ?? new PrismaClient(
  usePrismaAccelerate
    ? {
        accelerateUrl: databaseUrl,
      }
    : undefined
)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma