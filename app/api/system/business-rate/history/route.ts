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

    if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const rates = await prisma.rateHistory.findMany({
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        oldRate: true,
        newRate: true,
        effectiveDate: true,
        comment: true,
        createdAt: true,
        user: {
          select: { username: true, role: true },
        },
      },
    });

    return NextResponse.json({ success: true, rates });
  } catch (error) {
    console.error("GET BUSINESS RATE HISTORY ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

