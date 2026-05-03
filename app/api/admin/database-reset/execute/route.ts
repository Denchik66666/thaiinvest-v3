import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { wipeDatabaseForReset } from "@/lib/database-reset-wipe";
import { ensureDatabaseResetTables } from "@/lib/database-reset-schema-ensure";

const LOCK_MINUTES = 15;
const MAX_ATTEMPTS = 3;
const CONFIRM_WORD = "УДАЛИТЬ";
const DB_RETRIES = 5;

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("server has closed the connection") ||
    msg.includes("p1017")
  );
}

async function dbOp<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= DB_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientDbError(e) || attempt === DB_RETRIES) throw e;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error("dbOp exhausted");
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    await dbOp(() => ensureDatabaseResetTables(prisma));

    const userId = decoded.userId;
    const body = (await request.json()) as { password?: string; confirmPhrase?: string };
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPhrase = typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim() : "";

    const lockRow = await dbOp(() => prisma.databaseResetLockout.findUnique({ where: { userId } }));
    const now = new Date();
    if (lockRow?.lockedUntil && lockRow.lockedUntil <= now) {
      await dbOp(() =>
        prisma.databaseResetLockout.update({
        where: { userId },
        data: { failedCount: 0, lockedUntil: null },
        })
      );
    }
    if (lockRow?.lockedUntil && lockRow.lockedUntil > now) {
      return NextResponse.json(
        {
          error: "Слишком много попыток. Повторите позже.",
          lockedUntil: lockRow.lockedUntil.toISOString(),
        },
        { status: 423 }
      );
    }

    const config = await dbOp(() =>
      prisma.databaseResetConfig.findUnique({ where: { id: 1 } })
    );
    if (!config?.passwordHash) {
      return NextResponse.json({ error: "Сначала задайте и сохраните пароль сброса" }, { status: 400 });
    }

    if (!verifyPassword(password, config.passwordHash)) {
      const updated = await dbOp(() => prisma.databaseResetLockout.upsert({
        where: { userId },
        create: { userId, failedCount: 1, lockedUntil: null },
        update: { failedCount: { increment: 1 } },
      }));

      if (updated.failedCount >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
        await dbOp(() =>
          prisma.databaseResetLockout.update({
          where: { userId },
          data: { lockedUntil },
          })
        );
        return NextResponse.json(
          {
            error: `Неверный пароль. Доступ заблокирован на ${LOCK_MINUTES} минут.`,
            lockedUntil: lockedUntil.toISOString(),
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: "Неверный пароль",
          attemptsLeft: MAX_ATTEMPTS - updated.failedCount,
        },
        { status: 401 }
      );
    }

    if (confirmPhrase !== CONFIRM_WORD) {
      return NextResponse.json(
        { error: `Введите подтверждение точно: ${CONFIRM_WORD}` },
        { status: 400 }
      );
    }

    await dbOp(() => wipeDatabaseForReset(prisma));
    await dbOp(() => prisma.databaseResetLockout.deleteMany({ where: { userId } }));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("database-reset execute", e);
    if (isTransientDbError(e)) {
      return NextResponse.json(
        { error: "Проблема соединения с БД. Попробуйте ещё раз через несколько секунд." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
