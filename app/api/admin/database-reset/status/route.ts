import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDatabaseResetTables } from "@/lib/database-reset-schema-ensure";

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("server has closed the connection") ||
    msg.includes("p1017")
  );
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    await ensureDatabaseResetTables(prisma);

    const config = await prisma.databaseResetConfig.findUnique({ where: { id: 1 } });
    const configured = Boolean(config?.passwordHash?.length);

    const lock = await prisma.databaseResetLockout.findUnique({
      where: { userId: decoded.userId },
    });
    const now = new Date();
    const locked = Boolean(lock?.lockedUntil && lock.lockedUntil > now);

    return NextResponse.json({
      configured,
      locked,
      lockedUntil: locked && lock?.lockedUntil ? lock.lockedUntil.toISOString() : null,
      failedAttempts: lock?.failedCount ?? 0,
    });
  } catch (e) {
    console.error("database-reset status", e);
    if (isTransientDbError(e)) {
      return NextResponse.json({ error: "Проблема соединения с БД" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
