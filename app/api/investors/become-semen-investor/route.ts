import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { countFullWeeksBetween, getNextMonday, getPreviousOrCurrentMonday } from "@/lib/weekly";

const BecomeSemenInvestorSchema = z.object({
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  body: z.number().positive("Сумма вклада должна быть больше 0"),
  rate: z.number().positive("Ставка должна быть больше 0"),
  entryDate: z.string().min(1, "Дата входа обязательна"),
  allowMultiple: z.boolean().optional().default(false),
});

function calculateAccrued(body: number, rate: number, weeks: number): number {
  const weeklyRate = (rate / 100) / 4;
  return body * weeklyRate * weeks;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может использовать это действие" }, { status: 403 });
    }

    const parsed = BecomeSemenInvestorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    const { name, body, rate, entryDate, allowMultiple } = parsed.data;
    const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    if (!owner) return NextResponse.json({ error: "OWNER не найден" }, { status: 400 });

    if (!allowMultiple) {
      const existing = await prisma.investor.count({
        where: { linkedUserId: decoded.userId, isPrivate: false, ownerId: owner.id },
      });
      if (existing > 0) {
        return NextResponse.json(
          { error: "У тебя уже есть привязанный инвестор у Семёна. Для второго передай allowMultiple=true." },
          { status: 409 }
        );
      }
    }

    const entry = new Date(entryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activationDate = getNextMonday(entry);
    const status = activationDate <= today ? "active" : "awaiting_activation";

    let accrued = 0;
    if (status === "active") {
      const currentWeekMonday = getPreviousOrCurrentMonday(today);
      const weeks = countFullWeeksBetween(activationDate, currentWeekMonday);
      if (weeks > 0) accrued = calculateAccrued(body, rate, weeks);
    }

    const investor = await prisma.investor.create({
      data: {
        ownerId: owner.id,
        linkedUserId: decoded.userId,
        name,
        body,
        rate,
        accrued,
        entryDate: entry,
        activationDate,
        status,
        isPrivate: false,
      },
    });

    await logAction({
      userId: decoded.userId,
      action: "BECOME_SEMEN_INVESTOR",
      entityType: "Investor",
      entityId: investor.id,
      newValue: JSON.stringify(investor),
    });

    return NextResponse.json({ success: true, investor });
  } catch (error) {
    console.error("Become Semen investor error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
