import type { PrismaClient } from "@prisma/client";

type PrismaLike = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Безопасный fallback для окружений, где миграции ещё не доехали:
 * создаёт таблицы сброса БД при первом обращении к admin reset API.
 */
export async function ensureDatabaseResetTables(tx: PrismaLike) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DatabaseResetConfig" (
      "id" INTEGER NOT NULL DEFAULT 1,
      "passwordHash" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DatabaseResetConfig_pkey" PRIMARY KEY ("id")
    );
  `);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DatabaseResetLockout" (
      "userId" INTEGER NOT NULL,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "lockedUntil" TIMESTAMP(3),
      CONSTRAINT "DatabaseResetLockout_pkey" PRIMARY KEY ("userId")
    );
  `);
}
