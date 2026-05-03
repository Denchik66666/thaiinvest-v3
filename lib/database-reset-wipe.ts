import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";

type PrismaLike = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const RETRIES = 3;

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("server has closed the connection") ||
    msg.includes("p1017")
  );
}

async function withRetry(step: string, fn: () => Promise<void>) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await fn();
      return;
    } catch (e) {
      if (!isTransientDbError(e) || attempt === RETRIES) {
        if (e instanceof Error) {
          e.message = `[database-reset step: ${step}] ${e.message}`;
        }
        throw e;
      }
      console.warn(`[database-reset] retry ${attempt}/${RETRIES} for step: ${step}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
}

/**
 * Удаляет все бизнес-данные и пользователей INVESTOR.
 * Пользователи с ролями OWNER и SUPER_ADMIN сохраняются.
 */
export async function wipeDatabaseForReset(tx: PrismaLike) {
  await withRetry("truncate business tables", async () => {
    await tx.$executeRawUnsafe(`
      TRUNCATE TABLE
        "ChatMessage",
        "AuditLog",
        "RateHistory",
        "Payment",
        "Accrual",
        "BodyTopUpRequest",
        "Investor"
      RESTART IDENTITY CASCADE;
    `);
  });
  await withRetry("user.deleteMany(INVESTOR)", async () => {
    await tx.user.deleteMany({ where: { role: Role.INVESTOR } });
  });
  await withRetry("databaseResetLockout.deleteMany", async () => {
    await tx.databaseResetLockout.deleteMany({});
  });
  await withRetry("databaseResetConfig.upsert", async () => {
    await tx.databaseResetConfig.upsert({
      where: { id: 1 },
      create: { id: 1, passwordHash: null },
      update: { passwordHash: null },
    });
  });
}
