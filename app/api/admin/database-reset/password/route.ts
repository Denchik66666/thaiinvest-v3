import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashPassword, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDatabaseResetTables } from "@/lib/database-reset-schema-ensure";

const MIN_LEN = 8;
const SAVE_RETRIES = 3;

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("server has closed the connection") ||
    msg.includes("p1017")
  );
}

async function saveWithRetries(hash: string, userId: number) {
  for (let attempt = 1; attempt <= SAVE_RETRIES; attempt += 1) {
    try {
      await prisma.databaseResetConfig.upsert({
        where: { id: 1 },
        create: { id: 1, passwordHash: hash },
        update: { passwordHash: hash },
      });
      await prisma.databaseResetLockout.deleteMany({ where: { userId } });
      return;
    } catch (e) {
      if (!isTransientDbError(e) || attempt === SAVE_RETRIES) {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
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
    await ensureDatabaseResetTables(prisma);

    const body = (await request.json()) as { password?: string };
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_LEN) {
      return NextResponse.json(
        { error: `Пароль не короче ${MIN_LEN} символов` },
        { status: 400 }
      );
    }

    const hash = hashPassword(password);
    await saveWithRetries(hash, decoded.userId);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("database-reset password", e);
    if (isTransientDbError(e)) {
      return NextResponse.json(
        { error: "Проблема соединения с БД. Попробуйте ещё раз через несколько секунд." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
