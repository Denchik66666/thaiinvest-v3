import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";

type LedgerRow = {
  weekStart: string;
  weekEnd: string;
  bodyStart: number;
  weeklyRatePercent: number;
  accruedAdded: number;
  interestPaid: number;
  bodyPaid: number;
  closingPaid: number;
  accruedEnd: number;
  bodyEnd: number;
};

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

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        payments: true,
        owner: { select: { id: true, username: true, role: true } },
      },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (decoded.role === "OWNER") {
      if (investor.ownerId !== decoded.userId) {
        return NextResponse.json({ error: "Недостаточно прав для просмотра чужого инвестора" }, { status: 403 });
      }
      if (investor.isPrivate) {
        return NextResponse.json({ error: "Недостаточно прав для просмотра личной сети" }, { status: 403 });
      }
    }

    const now = new Date();
    const lastClosedWeekStart = getPreviousOrCurrentMonday(now);

    const rateHistory = await prisma.rateHistory.findMany({
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      select: { effectiveDate: true, newRate: true },
    });

    const resolveBusinessRateForWeek = (weekStart: Date) => {
      if (!rateHistory.length) return investor.rate;
      // Find the latest rateHistory row with effectiveDate <= weekStart.
      let idx = 0;
      while (idx + 1 < rateHistory.length && rateHistory[idx + 1].effectiveDate.getTime() <= weekStart.getTime()) {
        idx += 1;
      }
      return rateHistory[idx].newRate;
    };

    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    let cursor = new Date(investor.activationDate);
    cursor.setHours(0, 0, 0, 0);

    let body = investor.body;
    let accrued = 0;
    const rows: LedgerRow[] = [];

    while (cursor.getTime() < lastClosedWeekStart.getTime()) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor.getTime() + oneWeekMs);

      const businessRate = resolveBusinessRateForWeek(weekStart);
      const appliedRate = investor.isPrivate ? businessRate / 2 : businessRate;
      const weeklyRatePercent = appliedRate / 4;
      const accruedAdded = body * (weeklyRatePercent / 100);

      const completedPayments = investor.payments.filter((payment) => {
        if (payment.status !== "completed") return false;
        const eventDate = payment.acceptedAt ?? payment.approvedAt ?? payment.createdAt;
        return eventDate >= weekStart && eventDate < weekEnd;
      });

      const interestPaid = completedPayments
        .filter((payment) => payment.type === "interest")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const bodyPaid = completedPayments
        .filter((payment) => payment.type === "body")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const closingPaid = completedPayments
        .filter((payment) => payment.type === "close")
        .reduce((sum, payment) => sum + payment.amount, 0);

      accrued += accruedAdded;
      accrued = Math.max(accrued - interestPaid, 0);
      if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
      if (closingPaid > 0) {
        accrued = 0;
        body = 0;
      }

      rows.push({
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        bodyStart: body + bodyPaid,
        weeklyRatePercent,
        accruedAdded,
        interestPaid,
        bodyPaid,
        closingPaid,
        accruedEnd: accrued,
        bodyEnd: body,
      });

      cursor = weekEnd;
    }

    const currentWeekStart = new Date(lastClosedWeekStart);
    const currentWeekEnd = new Date(currentWeekStart.getTime() + oneWeekMs);

    const currentBusinessRate = resolveBusinessRateForWeek(currentWeekStart);
    const currentAppliedRate = investor.isPrivate ? currentBusinessRate / 2 : currentBusinessRate;
    const currentWeeklyRatePercent = currentAppliedRate / 4;

    const currentWeekPayments = investor.payments.filter((payment) => {
      if (payment.status !== "completed") return false;
      const eventDate = payment.acceptedAt ?? payment.approvedAt ?? payment.createdAt;
      return eventDate >= currentWeekStart && eventDate <= now;
    });

    if (currentWeekPayments.length > 0) {
      const interestPaid = currentWeekPayments
        .filter((payment) => payment.type === "interest")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const bodyPaid = currentWeekPayments
        .filter((payment) => payment.type === "body")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const closingPaid = currentWeekPayments
        .filter((payment) => payment.type === "close")
        .reduce((sum, payment) => sum + payment.amount, 0);

      accrued = Math.max(accrued - interestPaid, 0);
      if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
      if (closingPaid > 0) {
        accrued = 0;
        body = 0;
      }

      rows.push({
        weekStart: currentWeekStart.toISOString(),
        weekEnd: currentWeekEnd.toISOString(),
        bodyStart: body + bodyPaid,
        weeklyRatePercent: currentWeeklyRatePercent,
        accruedAdded: 0,
        interestPaid,
        bodyPaid,
        closingPaid,
        accruedEnd: accrued,
        bodyEnd: body,
      });
    }

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
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
