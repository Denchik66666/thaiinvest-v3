import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { mergeLedgerWeeks, type MergedHistoryWeek } from "@/lib/merge-ledger-weeks";
import { buildWeeklyLedgerRows } from "@/lib/weekly-ledger-rows";
import { isSameOpenWeekAsNow, openWeekDayProgress } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";

function paymentSortAt(p: { acceptedAt: Date | null; approvedAt: Date | null; createdAt: Date }) {
  return (p.acceptedAt ?? p.approvedAt ?? p.createdAt).toISOString();
}

function parseInitialBodyFromAudit(newValue: string | null): number | null {
  if (!newValue) return null;
  try {
    const j = JSON.parse(newValue) as { body?: unknown };
    const b = j.body;
    return typeof b === "number" && Number.isFinite(b) ? b : null;
  } catch {
    return null;
  }
}

function injectSyntheticCurrentWeek(merged: MergedHistoryWeek[], investorCount: number): MergedHistoryWeek[] {
  if (investorCount === 0) return merged;
  if (merged.some((w) => isSameOpenWeekAsNow(w.weekStart))) return merged;
  const { weekStart } = openWeekDayProgress();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const row: MergedHistoryWeek = {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    accrued: 0,
    paid: 0,
    paidInterest: 0,
    paidBody: 0,
    paidClose: 0,
    networkRatePercent: undefined,
    isSyntheticOpenRow: true,
  };
  return [row, ...merged];
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "INVESTOR") {
      return NextResponse.json({ error: "Доступно только инвестору" }, { status: 403 });
    }

    const now = new Date();

    const investors = await withDbRetry(() =>
      prisma.investor.findMany({
        where: { investorUserId: decoded.userId },
        include: {
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      })
    );

    const ids = investors.map((i) => i.id);
    if (ids.length === 0) {
      return NextResponse.json({ items: [] satisfies FinanceOperationItem[] });
    }

    const [rateHistory, payments, topUps, createInvestorAudits] = await withDbRetry(() =>
      Promise.all([
        prisma.rateHistory.findMany({
          orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
          select: { effectiveDate: true, newRate: true },
        }),
        prisma.payment.findMany({
          where: { investorId: { in: ids } },
          include: { investor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.bodyTopUpRequest.findMany({
          /** Без фильтра isPrivate: позиции уже ограничены `ids`; личная сеть тоже должна попадать в историю. */
          where: { investorId: { in: ids } },
          include: { investor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.auditLog.findMany({
          where: {
            entityType: "Investor",
            entityId: { in: ids },
            action: "CREATE_INVESTOR",
          },
          orderBy: { createdAt: "asc" },
          select: { entityId: true, newValue: true, createdAt: true },
        }),
      ])
    );

    const firstCreateAuditByInvestorId = new Map<number, string | null>();
    for (const row of createInvestorAudits) {
      if (!firstCreateAuditByInvestorId.has(row.entityId)) {
        firstCreateAuditByInvestorId.set(row.entityId, row.newValue);
      }
    }

    const rowSets = investors.map((inv) =>
      buildWeeklyLedgerRows(
        {
          activationDate: inv.activationDate,
          body: inv.body,
          rate: inv.rate,
          isPrivate: inv.isPrivate,
          payments: inv.payments,
        },
        rateHistory,
        now
      )
    );

    let merged = mergeLedgerWeeks(rowSets);
    merged = injectSyntheticCurrentWeek(merged, investors.length);

    const weekItems: FinanceOperationItem[] = merged.map((w) => ({
      kind: "week_accrual" as const,
      id: `week:${w.weekStart}`,
      sortAt: w.weekStart,
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      accrued: w.accrued,
      paidTotal: w.paid,
      paidInterest: w.paidInterest,
      paidBody: w.paidBody,
      paidClose: w.paidClose,
      networkRatePercent: w.networkRatePercent,
      syntheticOpen: w.isSyntheticOpenRow === true,
    }));

    const paymentItems: FinanceOperationItem[] = payments.map((p) => ({
      kind: "payment" as const,
      id: `pay:${p.id}`,
      sortAt: paymentSortAt(p),
      paymentId: p.id,
      investorId: p.investorId,
      positionName: p.investor.name,
      type: p.type,
      amount: p.amount,
      status: p.status,
      comment: p.comment,
      createdAt: p.createdAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
    }));

    const topUpItems: FinanceOperationItem[] = topUps.map((t) => ({
      kind: "topup" as const,
      id: `top:${t.id}`,
      sortAt: (t.decidedAt ?? t.createdAt).toISOString(),
      requestId: t.id,
      investorId: t.investorId,
      positionName: t.investor.name,
      amount: t.amount,
      status: t.status,
      comment: t.comment,
      createdAt: t.createdAt.toISOString(),
      decidedAt: t.decidedAt?.toISOString() ?? null,
    }));

    /** Создание позиции не создаёт BodyTopUpRequest — только запись в аудите / поля инвестора. */
    const startItems: FinanceOperationItem[] = investors.map((inv) => {
      const auditJson = firstCreateAuditByInvestorId.get(inv.id) ?? null;
      const initialBody = parseInitialBodyFromAudit(auditJson) ?? inv.body;
      return {
        kind: "position_start" as const,
        id: `start:${inv.id}`,
        sortAt: inv.activationDate.toISOString(),
        investorId: inv.id,
        positionName: inv.name,
        amount: initialBody,
        entryDate: inv.entryDate.toISOString(),
        activationDate: inv.activationDate.toISOString(),
      };
    });

    const items = [...weekItems, ...paymentItems, ...topUpItems, ...startItems].sort((a, b) => {
      const ta = new Date(a.sortAt).getTime();
      const tb = new Date(b.sortAt).getTime();
      if (tb !== ta) return tb - ta;
      return b.id.localeCompare(a.id);
    });

    const capped = items.slice(0, 400);

    return NextResponse.json({ items: capped satisfies FinanceOperationItem[] });
  } catch (error) {
    console.error("OPERATIONS_HISTORY_ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
