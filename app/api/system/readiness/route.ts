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
    const missing: string[] = [];
    if (!owner) missing.push("OWNER user");
    if (!superAdmin) missing.push("SUPER_ADMIN user");
    if (!superAdminBaseInvestor) missing.push("SUPER_ADMIN base investor in common network");

    return NextResponse.json({
      ready: missing.length === 0,
      missing,
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
        "Создайте базового инвестора SUPER_ADMIN в общей сети (это лимит для личной сети).",
        "Бизнес-ставка OWNER нужна только для автоматической ставки личной сети (50%).",
      ],
    });
  } catch (error) {
    console.error("SYSTEM READINESS ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
