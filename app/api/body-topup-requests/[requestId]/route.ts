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
import { parseCalendarDateOnlyYmd } from "@/lib/calendar-request-date";
import { clearOperationsHistoryServerCache } from "@/lib/operations-history-server-cache";
import { syncSingleInvestorAccruedAndPaidFromLedger } from "@/lib/business-rate-accrual-recalc";

const TOPUP_STATUSES = new Set([
  "pending_investor",
  "accepted_by_investor",
  "rejected_by_investor",
  "cancelled_by_owner",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Изменение зачисления тела при смене статуса/суммы заявки (accepted = деньги на теле). */
function investorBodyDeltaForTopUpPatch(
  oldStatus: string,
  oldAmount: number,
  nextStatus: string,
  nextAmount: number
): number {
  const acc = "accepted_by_investor";
  const was = oldStatus === acc;
  const will = nextStatus === acc;
  const a0 = moneyRound2(oldAmount);
  const a1 = moneyRound2(nextAmount);
  if (was && !will) return moneyRound2(-a0);
  if (!was && will) return a1;
  if (was && will && a1 !== a0) return moneyRound2(a1 - a0);
  return 0;
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId: sid } = await context.params;
    const requestId = Number(sid);
    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Некорректный id заявки" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может удалять заявки пополнения" }, { status: 403 });
    }

    const row = await withDbRetry(() =>
      prisma.bodyTopUpRequest.findUnique({
        where: { id: requestId },
        include: { investor: true },
      })
    );
    if (!row) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    const auditPayload = {
      investorId: row.investorId,
      amount: row.amount,
      status: row.status,
    };

    if (row.status === "accepted_by_investor") {
      const inv = row.investor;
      const amt = moneyRound2(row.amount);
      const nb = moneyRound2(inv.body - amt);
      if (nb < -1e-6) {
        return NextResponse.json(
          { error: "Тело позиции стало бы отрицательным — удаление отменено. Сначала поправьте сумму/статус." },
          { status: 400 }
        );
      }
      await withDbRetry(() =>
        prisma.investor.update({
          where: { id: inv.id },
          data: { body: moneyRound2(Math.max(0, nb)) },
        })
      );
    }

    await withDbRetry(() => prisma.bodyTopUpRequest.delete({ where: { id: row.id } }));

    await syncSingleInvestorAccruedAndPaidFromLedger(row.investorId);

    void logAction({
      userId: decoded.userId,
      action: "BODY_TOPUP_SUPER_ADMIN_DELETE",
      entityType: "BodyTopUpRequest",
      entityId: requestId,
      oldValue: JSON.stringify(auditPayload),
    });

    clearOperationsHistoryServerCache();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("BODY_TOPUP_DELETE:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Запись уже удалена" }, { status: 409 });
      }
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

function mergeYmdIntoUtcIsoPreservingTime(ymd: string, referenceIso: string): string {
  const ref = new Date(referenceIso);
  if (!Number.isFinite(ref.getTime())) return referenceIso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return referenceIso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  return new Date(
    Date.UTC(y, mo - 1, da, ref.getUTCHours(), ref.getUTCMinutes(), ref.getUTCSeconds(), ref.getUTCMilliseconds())
  ).toISOString();
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId: sid } = await context.params;
    const requestId = Number(sid);
    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Некорректный id заявки" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может править заявку таким способом" }, { status: 403 });
    }

    const body = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    const row = await withDbRetry(() =>
      prisma.bodyTopUpRequest.findUnique({
        where: { id: requestId },
        include: { investor: true },
      })
    );
    if (!row) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    let nextAmount = moneyRound2(row.amount);
    let nextStatus = row.status;
    let nextCreatedAt = row.createdAt;
    let nextRequestDate: Date | null = row.requestDate;
    let nextDecidedAt: Date | null = row.decidedAt;
    let nextDecidedById: number | null = row.decidedById;

    if ("amount" in body && typeof body.amount === "number" && Number.isFinite(body.amount)) {
      nextAmount = moneyRound2(body.amount);
      if (nextAmount <= 0) {
        return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });
      }
    }

    if ("status" in body && typeof body.status === "string") {
      const s = body.status.trim();
      if (!TOPUP_STATUSES.has(s)) {
        return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });
      }
      nextStatus = s;
    }

    if ("requestDate" in body) {
      if (body.requestDate === null) {
        nextRequestDate = null;
      } else if (typeof body.requestDate === "string") {
        const t = body.requestDate.trim();
        if (!t) {
          nextRequestDate = null;
        } else {
          const parsed = parseCalendarDateOnlyYmd(t);
          if (!parsed) {
            return NextResponse.json({ error: "requestDate: ожидается YYYY-MM-DD" }, { status: 400 });
          }
          nextRequestDate = parsed;
        }
      }
    }

    if ("createdAtYmd" in body && typeof body.createdAtYmd === "string" && body.createdAtYmd.trim()) {
      nextCreatedAt = new Date(mergeYmdIntoUtcIsoPreservingTime(body.createdAtYmd.trim(), row.createdAt.toISOString()));
    }

    if ("decidedAtYmd" in body) {
      const v = body.decidedAtYmd;
      if (v === null || v === "" || (typeof v === "string" && !v.trim())) {
        nextDecidedAt = null;
        nextDecidedById = null;
      } else if (typeof v === "string" && v.trim()) {
        const ref = row.decidedAt?.toISOString() ?? row.createdAt.toISOString();
        nextDecidedAt = new Date(mergeYmdIntoUtcIsoPreservingTime(v.trim(), ref));
        if (nextDecidedById == null) nextDecidedById = decoded.userId;
      }
    }

    const terminal = new Set(["accepted_by_investor", "rejected_by_investor", "cancelled_by_owner"]);
    if (terminal.has(nextStatus) && !nextDecidedAt) {
      nextDecidedAt = new Date();
      if (nextDecidedById == null) nextDecidedById = decoded.userId;
    }
    if (nextStatus === "pending_investor") {
      nextDecidedAt = null;
      nextDecidedById = null;
    }

    const delta = investorBodyDeltaForTopUpPatch(row.status, row.amount, nextStatus, nextAmount);
    const inv = row.investor;
    const newBody = moneyRound2(inv.body + delta);
    if (newBody < -1e-6) {
      return NextResponse.json(
        { error: "Тело позиции стало бы отрицательным — правка отклонена." },
        { status: 400 }
      );
    }

    const updated = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        if (delta !== 0) {
          await tx.investor.update({
            where: { id: inv.id },
            data: { body: moneyRound2(Math.max(0, newBody)) },
          });
        }
        return tx.bodyTopUpRequest.update({
          where: { id: row.id },
          data: {
            amount: nextAmount,
            status: nextStatus,
            createdAt: nextCreatedAt,
            requestDate: nextRequestDate,
            decidedAt: nextDecidedAt,
            decidedById: nextDecidedById,
          },
        });
      })
    );

    void logAction({
      userId: decoded.userId,
      action: "BODY_TOPUP_SUPER_ADMIN_PATCH",
      entityType: "BodyTopUpRequest",
      entityId: requestId,
      newValue: JSON.stringify({
        before: {
          amount: row.amount,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          requestDate: row.requestDate?.toISOString() ?? null,
          decidedAt: row.decidedAt?.toISOString() ?? null,
        },
        after: {
          amount: updated.amount,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
          requestDate: updated.requestDate?.toISOString() ?? null,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
        },
      }),
    });

    await syncSingleInvestorAccruedAndPaidFromLedger(inv.id);
    clearOperationsHistoryServerCache();

    return NextResponse.json({ success: true, request: updated });
  } catch (error: unknown) {
    console.error("BODY_TOPUP_PATCH:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
