import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { getNextMonday } from "@/lib/weekly";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { computeInvestorAccruedEndFromLedger, toWeeklyLedgerPayments } from "@/lib/investor-accrued-ledger";

const BecomeSemenInvestorSchema = z.object({
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  handle: z.string().max(200).optional(),
  phone: z.string().max(80).optional(),
  body: z.number().positive("Сумма вклада должна быть больше 0"),
  rate: z.number().positive("Ставка должна быть больше 0"),
  entryDate: z.string().min(1, "Дата входа обязательна"),
  allowMultiple: z.boolean().optional().default(false),
});

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
    const handleTrim = parsed.data.handle?.trim() ?? "";
    const phoneTrim = parsed.data.phone?.trim() ?? "";
    const owner = await withDbRetry(() => prisma.user.findFirst({ where: { role: "OWNER" } }));
    if (!owner) return NextResponse.json({ error: "OWNER не найден" }, { status: 400 });

    if (!allowMultiple) {
      const existing = await withDbRetry(() =>
        prisma.investor.count({
          where: { linkedUserId: decoded.userId, isPrivate: false, ownerId: owner.id },
        })
      );
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

    const rateHistory = await withDbRetry(() =>
      prisma.rateHistory.findMany({
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        select: { effectiveDate: true, newRate: true },
      })
    );

    let accrued = 0;
    if (status === "active") {
      accrued = computeInvestorAccruedEndFromLedger({
        activationDate,
        body,
        rate,
        isPrivate: false,
        payments: toWeeklyLedgerPayments([]),
        bodyTopUpRows: [],
        rateHistory,
        now: today,
      });
    }

    const investor = await withDbRetry(() =>
      prisma.investor.create({
        data: {
          ownerId: owner.id,
          linkedUserId: decoded.userId,
          name,
          handle: handleTrim || null,
          phone: phoneTrim || null,
          body,
          rate,
          accrued,
          entryDate: entry,
          activationDate,
          status,
          isPrivate: false,
        },
      })
    );

    try {
      await withDbRetry(() =>
        logAction({
          userId: decoded.userId,
          action: "BECOME_SEMEN_INVESTOR",
          entityType: "Investor",
          entityId: investor.id,
          newValue: JSON.stringify(investor),
        })
      );
    } catch (auditError) {
      console.error("Become Semen investor audit error:", auditError);
    }

    return NextResponse.json({ success: true, investor });
  } catch (error) {
    console.error("Become Semen investor error:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
