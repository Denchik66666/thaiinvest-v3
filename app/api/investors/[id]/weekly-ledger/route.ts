import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { buildWeeklyLedgerRows } from "@/lib/weekly-ledger-rows";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный investorId" }, { status: 400 });
    }

    const investor = await withDbRetry(() =>
      prisma.investor.findUnique({
        where: { id: investorId },
        include: {
          payments: true,
          owner: { select: { id: true, username: true, role: true } },
        },
      })
    );
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (decoded.role === "OWNER") {
      if (investor.ownerId !== decoded.userId) {
        return NextResponse.json({ error: "Недостаточно прав для просмотра чужого инвестора" }, { status: 403 });
      }
      if (investor.isPrivate) {
        return NextResponse.json({ error: "Недостаточно прав для просмотра личной сети" }, { status: 403 });
      }
    }
    if (
      decoded.role === "INVESTOR" &&
      investor.investorUserId !== decoded.userId &&
      investor.linkedUserId !== decoded.userId
    ) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const rateHistory = await withDbRetry(() =>
      prisma.rateHistory.findMany({
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        select: { effectiveDate: true, newRate: true },
      })
    );

    const rows = buildWeeklyLedgerRows(
      {
        activationDate: investor.activationDate,
        body: investor.body,
        rate: investor.rate,
        isPrivate: investor.isPrivate,
        payments: investor.payments,
      },
      rateHistory,
      new Date()
    );

    return NextResponse.json({
      investor: {
        id: investor.id,
        name: investor.name,
        owner: investor.owner,
        rate: investor.rate,
        body: investor.body,
        accrued: investor.accrued,
        paid: investor.paid,
        activationDate: investor.activationDate,
      },
      summary: {
        weeks: rows.length,
        totalAccruedAdded: rows.reduce((sum, row) => sum + row.accruedAdded, 0),
        totalInterestPaid: rows.reduce((sum, row) => sum + row.interestPaid, 0),
        totalBodyPaid: rows.reduce((sum, row) => sum + row.bodyPaid, 0),
      },
      note: "Расчет недельный, по закрытым неделям, на текущей модели данных без событий увеличения тела.",
      rows,
    });
  } catch (error) {
    console.error("WEEKLY_LEDGER_ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
