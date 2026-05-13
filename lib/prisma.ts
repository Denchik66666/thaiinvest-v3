import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: Pool | undefined
}

const databaseUrl = process.env.DATABASE_URL
const directUrl = process.env.DIRECT_URL
const usePrismaAccelerate = Boolean(databaseUrl?.startsWith('prisma+postgres://'))

/** Обычный Postgres URI (не prisma+) — для PrismaPg. */
function isDirectPostgresUrl(url: string | undefined): url is string {
  if (!url) return false
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
}

function isSupabaseHost(url: string): boolean {
  return url.includes('supabase.co') || url.includes('supabase.com')
}

/**
 * Строка для node-pg Pool: без sslmode (SSL задаём у Pool), без connection_limit
 * (лимит задаётся опцией Pool.max). Transaction pooler Supabase :6543 — pgbouncer=true.
 */
function connectionStringForPgPool(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    parsed.searchParams.delete('sslmode')
    parsed.searchParams.delete('connection_limit')
    const port = parsed.port || '5432'
    if (port === '6543' && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true')
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '12')
    }
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

function parsePoolMax(): number {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 30)
  /** Баланс параллелизма и лимита проекта EMAXCONN; подстроить через DATABASE_POOL_MAX. */
  return 6
}

/**
 * Один общий Pool на процесс: при передаче строки в PrismaPg без Pool адаптер
 * создаёт новый Pool на каждый connect() → исчерпание лимита соединений Supabase.
 *
 * Pool.max > 1 нужен для параллельных запросов Next (иначе очередь и «timeout exceeded»).
 */
function singletonPgPool(connectionString: string): Pool {
  if (globalForPrisma.pgPool) return globalForPrisma.pgPool
  const conn = connectionStringForPgPool(connectionString)
  globalForPrisma.pgPool = new Pool({
    connectionString: conn,
    max: parsePoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 12_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ...(isSupabaseHost(connectionString) ? { ssl: { rejectUnauthorized: false } as const } : {}),
  })
  return globalForPrisma.pgPool
}

function createPrismaClient(): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  if (isDirectPostgresUrl(databaseUrl)) {
    const pool = singletonPgPool(databaseUrl)
    return new PrismaClient({ adapter: new PrismaPg(pool) })
  }

  // Fallback: DIRECT_URL, если DATABASE_URL не postgres URI (например prisma+).
  if (isDirectPostgresUrl(directUrl)) {
    const pool = singletonPgPool(directUrl)
    return new PrismaClient({ adapter: new PrismaPg(pool) })
  }

  // Fallback для prisma+ URL (Accelerate), если прямой URL не задан.
  if (usePrismaAccelerate) {
    return new PrismaClient({ accelerateUrl: databaseUrl })
  }

  throw new Error('Unsupported DATABASE_URL format. Use postgres://, postgresql://, or provide DIRECT_URL')
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = prisma
