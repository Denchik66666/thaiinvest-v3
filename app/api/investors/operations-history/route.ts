/**
 * GET /api/investors/operations-history
 *
 * Тело: `{ items: FinanceOperationItem[], meta?: { investorSelection } }`.
 * При SUPER_ADMIN + `linkedCommon=1` без `investorId` — только позиции «Семёна» на главной (общая сеть + linkedUser / isSystemOwner).
 * При SUPER_ADMIN + `network=all` без `investorId` отбор ограничен (см. `superAdminFinanceMaxPositions`);
 * если строк больше лимита — `meta.investorSelection.investorPositions.moreAvailable === true`
 * и заголовок `X-Thaiinvest-Investor-Selection-Partial: 1`.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRateHistoryRowsForLedger } from "@/lib/rate-history-rows-cache";
import { superAdminFinanceMaxPositions } from "@/lib/super-admin-finance-limits";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { mergeLedgerWeeks, type MergedHistoryWeek } from "@/lib/merge-ledger-weeks";
import { buildWeeklyLedgerRows, type WeeklyLedgerPaymentInput } from "@/lib/weekly-ledger-rows";
import { isSameOpenWeekAsNow, openWeekDayProgress } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { FinanceInvestorSelectionMeta, OperationsHistoryResponse } from "@/types/operations-finance-api";

type CacheEntry = { expiresAt: number; payload: OperationsHistoryResponse };
const CACHE_TTL_MS = 60_000;
const memoryCache = new Map<string, CacheEntry>();

/** В ленте и сортировке — дата заявки (createdAt), не момент подтверждения. */
function paymentSortAt(p: { createdAt: Date }) {
  return p.createdAt.toISOString();
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

export async function GET(request: NextRequest) {
  let cacheKeyForStale: string | undefined;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "INVESTOR" && decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Доступно только инвестору, владельцу сети или супер-админу (личные позиции)" },
        { status: 403 }
      );
    }

    const now = new Date();

    const networkRaw = request.nextUrl.searchParams.get("network");
    const linkedCommonHome =
      decoded.role === "SUPER_ADMIN" &&
      request.nextUrl.searchParams.get("linkedCommon") === "1" &&
      (request.nextUrl.searchParams.get("investorId") == null || request.nextUrl.searchParams.get("investorId") === "");

    const superAdminNetwork =
      decoded.role === "SUPER_ADMIN" &&
      (networkRaw === "private" || networkRaw === "common" || networkRaw === "all")
        ? networkRaw
        : decoded.role === "SUPER_ADMIN"
          ? "common"
          : null;

    let investorsWhere: Prisma.InvestorWhereInput;

    if (decoded.role === "INVESTOR") {
      investorsWhere = { investorUserId: decoded.userId };
    } else if (decoded.role === "OWNER") {
      investorsWhere = { ownerId: decoded.userId };
    } else if (decoded.role === "SUPER_ADMIN") {
      const investorIdEarly =
        request.nextUrl.searchParams.get("investorId") != null &&
        request.nextUrl.searchParams.get("investorId") !== ""
          ? Number(request.nextUrl.searchParams.get("investorId"))
          : null;
      if (
        investorIdEarly != null &&
        Number.isFinite(investorIdEarly) &&
        investorIdEarly > 0 &&
        Number.isInteger(investorIdEarly)
      ) {
        investorsWhere = {};
      } else if (linkedCommonHome) {
        /** Главная SUPER_ADMIN: позиции, привязанные к аккаунту Семёна, + базовая `isSystemOwner` (если без linkedUser). */
        investorsWhere = {
          isPrivate: false,
          OR: [{ linkedUserId: decoded.userId }, { isSystemOwner: true }],
        };
      } else if (superAdminNetwork === "common") {
        investorsWhere = { isPrivate: false };
      } else if (superAdminNetwork === "private") {
        investorsWhere = { isPrivate: true };
      } else {
        investorsWhere = {};
      }
    } else {
      investorsWhere = {};
    }

    const investorIdRaw = request.nextUrl.searchParams.get("investorId");
    const investorId =
      investorIdRaw != null && investorIdRaw !== ""
        ? Number(investorIdRaw)
        : null;

    if (investorId != null && (!Number.isFinite(investorId) || investorId <= 0 || !Number.isInteger(investorId))) {
      return NextResponse.json({ error: "Некорректный investorId" }, { status: 400 });
    }

    const cacheNetworkSeg =
      decoded.role === "SUPER_ADMIN" && investorId == null
        ? linkedCommonHome
          ? "linkedCommon"
          : String(superAdminNetwork ?? "common")
        : "";
    const cacheKey = `${decoded.userId}:${decoded.role}:${investorId == null ? "all" : String(investorId)}:${cacheNetworkSeg}`;
    cacheKeyForStale = cacheKey;
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      });
    }

    const histBundle = await withDbRetry(async () => {
      const superAdminAllNetworkUnscoped =
        decoded.role === "SUPER_ADMIN" && investorId == null && superAdminNetwork === "all";
      const cap = superAdminFinanceMaxPositions();
      const takeFetch = superAdminAllNetworkUnscoped ? cap + 1 : undefined;

      const scopedRaw = await prisma.investor.findMany({
        where: investorId != null ? { ...investorsWhere, id: investorId } : investorsWhere,
        select: {
          id: true,
          name: true,
          body: true,
          rate: true,
          isPrivate: true,
          entryDate: true,
          activationDate: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: superAdminAllNetworkUnscoped ? { updatedAt: "desc" } : { createdAt: "desc" },
        take: takeFetch,
      });

      let moreAvailable = false;
      let scopedInvestors = scopedRaw;
      if (superAdminAllNetworkUnscoped) {
        moreAvailable = scopedRaw.length > cap;
        scopedInvestors = moreAvailable ? scopedRaw.slice(0, cap) : scopedRaw;
      }

      const investorSelectionMeta: FinanceInvestorSelectionMeta | undefined = superAdminAllNetworkUnscoped
        ? {
            investorPositions: {
              moreAvailable,
              included: scopedInvestors.length,
              limit: cap,
              orderBy: "updatedAt_desc",
            },
          }
        : undefined;

      if (investorId != null && scopedInvestors.length === 0) {
        return { tag: "nf" as const };
      }

      const ids = scopedInvestors.map((i) => i.id);
      if (ids.length === 0) {
        return { tag: "empty" as const };
      }

      const [rateHistory, payments, topUps, createInvestorAudits] = await Promise.all([
        getRateHistoryRowsForLedger(),
        prisma.payment.findMany({
          where: { investorId: { in: ids } },
          select: {
            id: true,
            investorId: true,
            type: true,
            amount: true,
            status: true,
            comment: true,
            createdAt: true,
            approvedAt: true,
            acceptedAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.bodyTopUpRequest.findMany({
          /** Без фильтра isPrivate: позиции уже ограничены `ids`; личная сеть тоже должна попадать в историю. */
          where: { investorId: { in: ids } },
          select: {
            id: true,
            investorId: true,
            amount: true,
            status: true,
            comment: true,
            createdAt: true,
            decidedAt: true,
          },
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
      ]);

      return {
        tag: "ok" as const,
        scopedInvestors,
        rateHistory,
        payments,
        topUps,
        createInvestorAudits,
        investorSelectionMeta,
      };
    });

    if (histBundle.tag === "nf") {
      return NextResponse.json({ error: "Позиция не найдена в доступной сети" }, { status: 404 });
    }
    if (histBundle.tag === "empty") {
      return NextResponse.json({ items: [] satisfies FinanceOperationItem[] } satisfies OperationsHistoryResponse);
    }

    const { scopedInvestors, rateHistory, payments, topUps, createInvestorAudits, investorSelectionMeta } = histBundle;

    const positionNameById = new Map(scopedInvestors.map((i) => [i.id, i.name]));

    const paymentsByInvestorId = new Map<number, typeof payments>();
    for (const p of payments) {
      const list = paymentsByInvestorId.get(p.investorId) ?? [];
      list.push(p);
      paymentsByInvestorId.set(p.investorId, list);
    }

    const firstCreateAuditByInvestorId = new Map<number, string | null>();
    for (const row of createInvestorAudits) {
      if (!firstCreateAuditByInvestorId.has(row.entityId)) {
        firstCreateAuditByInvestorId.set(row.entityId, row.newValue);
      }
    }

    const rowSets = scopedInvestors.map((inv) =>
      buildWeeklyLedgerRows(
        {
          activationDate: inv.activationDate,
          body: inv.body,
          rate: inv.rate,
          isPrivate: inv.isPrivate,
          payments: (paymentsByInvestorId.get(inv.id) ?? []) as WeeklyLedgerPaymentInput[],
        },
        rateHistory,
        now
      )
    );

    let merged = mergeLedgerWeeks(rowSets);
    merged = injectSyntheticCurrentWeek(merged, scopedInvestors.length);

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
      positionName: positionNameById.get(p.investorId) ?? "",
      type: p.type,
      amount: p.amount,
      status: p.status,
      comment: p.comment,
      createdAt: p.createdAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
    }));

    const topUpFromRequests: FinanceOperationItem[] = topUps.map((t) => ({
      kind: "topup" as const,
      id: `top:${t.id}`,
      sortAt: (t.decidedAt ?? t.createdAt).toISOString(),
      requestId: t.id,
      investorId: t.investorId,
      positionName: positionNameById.get(t.investorId) ?? "",
      amount: t.amount,
      status: t.status,
      comment: t.comment,
      createdAt: t.createdAt.toISOString(),
      decidedAt: t.decidedAt?.toISOString() ?? null,
    }));

    /** Начальное тело при создании позиции — в ленте как пополнение (без BodyTopUpRequest). */
    const topUpFromCreation: FinanceOperationItem[] = scopedInvestors.map((inv) => {
      const auditJson = firstCreateAuditByInvestorId.get(inv.id) ?? null;
      const initialBody = parseInitialBodyFromAudit(auditJson) ?? inv.body;
      return {
        kind: "topup" as const,
        id: `top:initial:${inv.id}`,
        sortAt: inv.activationDate.toISOString(),
        requestId: -inv.id,
        investorId: inv.id,
        positionName: inv.name,
        amount: initialBody,
        status: "completed_at_creation",
        comment: null,
        createdAt: inv.createdAt.toISOString(),
        decidedAt: inv.activationDate.toISOString(),
        initialFromCreation: true,
        entryDate: inv.entryDate.toISOString(),
        activationDate: inv.activationDate.toISOString(),
      };
    });

    const topUpItems = [...topUpFromRequests, ...topUpFromCreation];

    const items = [...weekItems, ...paymentItems, ...topUpItems].sort((a, b) => {
      const ta = new Date(a.sortAt).getTime();
      const tb = new Date(b.sortAt).getTime();
      if (tb !== ta) return tb - ta;
      return b.id.localeCompare(a.id);
    });

    const capped = items.slice(0, 400);

    const payload: OperationsHistoryResponse = {
      items: capped satisfies FinanceOperationItem[],
      ...(investorSelectionMeta ? { meta: { investorSelection: investorSelectionMeta } } : {}),
    };
    memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    };
    if (investorSelectionMeta?.investorPositions.moreAvailable) {
      headers["X-Thaiinvest-Investor-Selection-Partial"] = "1";
    }
    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("OPERATIONS_HISTORY_ERROR:", error);
    if (isTransientDbError(error)) {
      const stale = cacheKeyForStale ? memoryCache.get(cacheKeyForStale) : undefined;
      if (stale) {
        return NextResponse.json(stale.payload, {
          headers: {
            "Cache-Control": "private, max-age=0, stale-while-revalidate=120",
          },
        });
      }
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
