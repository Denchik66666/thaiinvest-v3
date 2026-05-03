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

function withSafePgParams(url: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '1')
    if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '10')
    if (!parsed.searchParams.has('connectionTimeoutMillis')) parsed.searchParams.set('connectionTimeoutMillis', '5000')
    if (!parsed.searchParams.has('keepalive')) parsed.searchParams.set('keepalive', '1')
    if (!parsed.searchParams.has('keepalives_idle')) parsed.searchParams.set('keepalives_idle', '30')
    return parsed.toString()
  } catch {
    return url
  }
}

function createPrismaClient(): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  // Предпочитаем DATABASE_URL (pooler), чтобы не упираться в session pool limits.
  if (isDirectPostgresUrl(databaseUrl)) {
    return new PrismaClient({ adapter: new PrismaPg(withSafePgParams(databaseUrl)) })
  }

  // Fallback: DIRECT_URL, если DATABASE_URL не подходит.
  if (isDirectPostgresUrl(directUrl)) {
    return new PrismaClient({ adapter: new PrismaPg(withSafePgParams(directUrl)) })
  }

  // Fallback для prisma+ URL (Accelerate), если прямой URL не задан.
  if (usePrismaAccelerate) {
    return new PrismaClient({ accelerateUrl: databaseUrl })
  }

  throw new Error('Unsupported DATABASE_URL format. Use postgres://, postgresql://, or provide DIRECT_URL')
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = prisma
