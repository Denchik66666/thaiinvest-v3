import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";
import {
  getBusinessRateBeforeEffectiveMonday,
  isStrictlyFutureEffectiveDate,
  recalculateInvestorAccruedFromRateHistory,
} from "@/lib/business-rate-accrual-recalc";

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function requireOwnerOrSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  const decoded = verifyToken(token);
  if (!decoded) return { error: NextResponse.json({ error: "Неверный токен" }, { status: 401 }) };
  if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { decoded };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwnerOrSuperAdmin();
    if ("error" in auth) return auth.error;
    const { decoded } = auth;

    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }

    const existing = await prisma.rateHistory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

    if (!isStrictlyFutureEffectiveDate(existing.effectiveDate)) {
      return NextResponse.json(
        { error: "Редактировать можно только запланированные (будущие) изменения" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      newRate?: number;
      effectiveDate?: string;
      comment?: string | null;
    };

    const hasNewRate = body.newRate !== undefined;
    const hasEffective = body.effectiveDate !== undefined;
    const hasComment = body.comment !== undefined;

    if (!hasNewRate && !hasEffective && !hasComment) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    if (hasNewRate && (typeof body.newRate !== "number" || body.newRate <= 0)) {
      return NextResponse.json({ error: "newRate должен быть числом > 0" }, { status: 400 });
    }

    if (hasComment && body.comment !== null && typeof body.comment !== "string") {
      return NextResponse.json({ error: "comment должен быть строкой или null" }, { status: 400 });
    }

    let effectiveMonday = existing.effectiveDate;
    if (hasEffective) {
      const parsed = parseDate(body.effectiveDate);
      if (parsed == null || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Некорректный effectiveDate" }, { status: 400 });
      }
      effectiveMonday = getPreviousOrCurrentMonday(parsed);
    }

    if (!isStrictlyFutureEffectiveDate(effectiveMonday)) {
      return NextResponse.json(
        { error: "Дата вступления должна быть строго в будущем (после сегодняшнего дня)" },
        { status: 400 }
      );
    }

    const newRate = hasNewRate ? body.newRate! : existing.newRate;
    const oldRate = (await getBusinessRateBeforeEffectiveMonday(effectiveMonday, id)) ?? newRate;
    const comment = hasComment ? body.comment : existing.comment;

    const rate = await prisma.rateHistory.update({
      where: { id },
      data: {
        newRate,
        oldRate,
        effectiveDate: effectiveMonday,
        comment,
        changedBy: decoded.userId,
      },
    });

    await recalculateInvestorAccruedFromRateHistory();

    return NextResponse.json({ success: true, rate });
  } catch (error) {
    console.error("PATCH BUSINESS RATE HISTORY ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwnerOrSuperAdmin();
    if ("error" in auth) return auth.error;

    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }

    const existing = await prisma.rateHistory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

    if (!isStrictlyFutureEffectiveDate(existing.effectiveDate)) {
      return NextResponse.json(
        { error: "Удалять можно только запланированные (будущие) изменения" },
        { status: 400 }
      );
    }

    // На один понедельник часто несколько строк (дубли); иначе delete по id убирает только одну,
    // а в UI снова показывается «победитель» по дню — кажется, что ничего не удалили.
    const dayStart = startOfDay(existing.effectiveDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const result = await prisma.rateHistory.deleteMany({
      where: {
        effectiveDate: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    });

    await recalculateInvestorAccruedFromRateHistory();

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error("DELETE BUSINESS RATE HISTORY ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
