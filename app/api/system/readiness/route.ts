import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может смотреть готовность системы" }, { status: 403 });
    }

    const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    const superAdmin = await prisma.user.findUnique({ where: { id: decoded.userId } });
    const superAdminBaseInvestor = await prisma.investor.findFirst({
      where: {
        isPrivate: false,
        OR: [{ ownerId: decoded.userId }, { linkedUserId: decoded.userId }],
      },
      orderBy: { createdAt: "asc" },
    });
    /**
     * Важно: базовая позиция инвестора для SUPER_ADMIN полезна (лимиты/настройки),
     * но не должна блокировать старт системы после сброса БД.
     */
    const missingBlocking: string[] = [];
    const missingOptional: string[] = [];
    if (!owner) missingBlocking.push("OWNER user");
    if (!superAdmin) missingBlocking.push("SUPER_ADMIN user");
    if (!superAdminBaseInvestor) missingOptional.push("SUPER_ADMIN base investor in common network");

    return NextResponse.json({
      ready: missingBlocking.length === 0,
      /** Backward-compatible: "missing" теперь только блокирующие пункты. */
      missing: missingBlocking,
      missingBlocking,
      missingOptional,
      snapshot: {
        ownerUser: owner ? { id: owner.id, username: owner.username } : null,
        superAdminUser: superAdmin ? { id: superAdmin.id, username: superAdmin.username } : null,
        superAdminBaseInvestor: superAdminBaseInvestor
          ? {
              id: superAdminBaseInvestor.id,
              body: superAdminBaseInvestor.body,
              rate: superAdminBaseInvestor.rate,
            }
          : null,
      },
      recommendations: [
        "Опционально: создайте базового инвестора SUPER_ADMIN в общей сети (используется как лимит/настройка личной сети).",
        "Бизнес-ставку задаёт только владелец (OWNER) в «Управлении»; от неё зависят начисления в общей сети и база для личной сети (50%).",
      ],
    });
  } catch (error) {
    console.error("SYSTEM READINESS ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
