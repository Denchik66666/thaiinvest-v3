export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { moneyRound2 } from "@/lib/money-round";
import { clearOperationsHistoryServerCache } from "@/lib/operations-history-server-cache";
import { syncSingleInvestorAccruedAndPaidFromLedger } from "@/lib/business-rate-accrual-recalc";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ paymentId: string }> }) {
  try {
    const { paymentId: sid } = await context.params;
    const paymentId = Number(sid);
    if (!Number.isFinite(paymentId) || paymentId <= 0 || !Number.isInteger(paymentId)) {
      return NextResponse.json({ error: "Некорректный id заявки" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может удалять записи заявок" }, { status: 403 });
    }

    let auditPayload: {
      investorId: number;
      type: string;
      amount: number;
      status: string;
    } | null = null;

    /**
     * PgBouncer в режиме transaction pooling с Prisma-транзакциями ($transaction) часто «висит» до таймаута (~45 с) → 503.
     * Откат проводки и удаление заявки — два последовательных запроса (короткое окно гонки допустимо для ручного действия SUPER_ADMIN).
     */
    const payment = await withDbRetry(() =>
      prisma.payment.findUnique({
        where: { id: paymentId },
        include: { investor: true },
      })
    );
    if (!payment) throw new Error("NOT_FOUND");

    const payType = payment.type.trim().toLowerCase();

    if (payment.status === "completed" && payType === "close") {
      throw new Error("DELETE_CLOSE_UNSUPPORTED");
    }

    /** Восстановление тела при удалении завершённой выплаты «тело» — нужно для формулы леджера (`Investor.body` + completed body payments). Проценты: только удаление строки + пересчёт каноном. */
    if (payment.status === "completed" && payType === "body") {
      const inv = payment.investor;
      const amt = moneyRound2(payment.amount);
      const nb = moneyRound2(inv.body + amt);
      await withDbRetry(() =>
        prisma.investor.update({
          where: { id: inv.id },
          data: {
            body: nb,
            status: nb > 0 && inv.status === "closed" ? "active" : inv.status,
          },
        })
      );
    }

    auditPayload = {
      investorId: payment.investorId,
      type: payType,
      amount: payment.amount,
      status: payment.status,
    };

    await withDbRetry(() => prisma.payment.delete({ where: { id: payment.id } }));

    await syncSingleInvestorAccruedAndPaidFromLedger(payment.investorId);

    if (auditPayload) {
      void logAction({
        userId: decoded.userId,
        action: "PAYMENT_SUPER_ADMIN_DELETE",
        entityType: "Payment",
        entityId: paymentId,
        oldValue: JSON.stringify(auditPayload),
      });
    }

    clearOperationsHistoryServerCache();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }
    if (msg === "INVESTOR_NOT_FOUND") {
      return NextResponse.json({ error: "Позиция инвестора для этой заявки не найдена" }, { status: 400 });
    }
    if (msg === "DELETE_CLOSE_UNSUPPORTED") {
      return NextResponse.json(
        {
          error:
            "Завершённую заявку на закрытие позиции нельзя удалить автоматически: не восстановить разбиение тело/проценты. Обратитесь к разработчику или правьте позицию вручную.",
        },
        { status: 400 }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("PAYMENT_DELETE_PRISMA:", error.code, error.meta, error.message);
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Запись уже удалена или не найдена (P2025)" },
          { status: 409 }
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Удаление заблокировано связями в базе (P2003)" },
          { status: 409 }
        );
      }
      if (error.code === "P2034") {
        return NextResponse.json(
          { error: "Конфликт транзакции, попробуйте ещё раз (P2034)" },
          { status: 409 }
        );
      }
      if (error.code === "P2028") {
        return NextResponse.json({ error: "Таймаут транзакции БД, повторите запрос (P2028)" }, { status: 503 });
      }
      return NextResponse.json({ error: `Ошибка базы: ${error.code}` }, { status: 409 });
    }

    console.error("PAYMENT_DELETE:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
