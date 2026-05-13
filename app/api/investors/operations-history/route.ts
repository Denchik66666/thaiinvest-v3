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
import { superAdminFinanceMaxPositions } from "@/lib/super-admin-finance-limits";
import { findBodyTopUpsForOperationsHistory } from "@/lib/body-topup-request-date-compat";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { resolveInitialBodyAtCreation } from "@/lib/investor-create-audit-body";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { getWeekStartMonday, startOfDay } from "@/lib/weekly";
import { mergeLedgerWeeks, type MergedHistoryWeek } from "@/lib/merge-ledger-weeks";
import {
  buildWeeklyLedgerRows,
  ledgerAcceptedTopUpsFromPrismaRows,
  type WeeklyLedgerPaymentInput,
} from "@/lib/weekly-ledger-rows";
import { isSameOpenWeekAsNow, openWeekDayProgress } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { FinanceInvestorSelectionMeta, OperationsHistoryResponse } from "@/types/operations-finance-api";
import {
  getOperationsHistoryCacheEntry,
  setOperationsHistoryCacheEntry,
} from "@/lib/operations-history-server-cache";

/** В ленте и сортировке выплат — момент подачи (`createdAt`), не подтверждения. */
function paymentSortAt(p: { createdAt: Date }) {
  return p.createdAt.toISOString();
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
      /** Как в GET `/api/body-topup-requests`: позиции «моего» аккаунта и привязка к общей сети. */
      investorsWhere = {
        OR: [{ investorUserId: decoded.userId }, { linkedUserId: decoded.userId, isPrivate: false }],
      };
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
    const cached = getOperationsHistoryCacheEntry(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate",
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
          handle: true,
          body: true,
          rate: true,
          isPrivate: true,
          entryDate: true,
          activationDate: true,
          createdAt: true,
          updatedAt: true,
          investorUser: { select: { username: true } },
          linkedUser: { select: { username: true } },
          /** Как в GET `/api/investors/[id]/weekly-ledger`: те же платежи, что вложены в позицию (не отдельный findMany). */
          payments: {
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
          },
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

      const [rateHistory, topUps, createInvestorAudits] = await Promise.all([
        prisma.rateHistory.findMany({
          orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
          select: { effectiveDate: true, newRate: true },
        }),
        findBodyTopUpsForOperationsHistory(ids),
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

    const { scopedInvestors, rateHistory, topUps, createInvestorAudits, investorSelectionMeta } = histBundle;

    const topUpsByInvestorId = new Map<number, (typeof topUps)[number][]>();
    for (const t of topUps) {
      const list = topUpsByInvestorId.get(t.investorId) ?? [];
      list.push(t);
      topUpsByInvestorId.set(t.investorId, list);
    }

    const positionNameById = new Map(
      scopedInvestors.map((i) => [i.id, investorDisplayHandle(i) ?? i.name])
    );

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
          payments: inv.payments as WeeklyLedgerPaymentInput[],
          acceptedBodyTopUps: ledgerAcceptedTopUpsFromPrismaRows(topUpsByInvestorId.get(inv.id) ?? []),
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
      /** Конец закрытой недели, чтобы события внутри интервала (пополнение 04.03 и т.д.) в ленте (sortAt desc) шли **ниже** строки начисления за эту неделю — хронология «сначала факты в неделе, затем итог начисления». */
      sortAt: w.weekEnd,
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

    const paymentItems: FinanceOperationItem[] = scopedInvestors.flatMap((inv) =>
      inv.payments.map((p) => ({
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
      }))
    );

    const topUpFromRequests: FinanceOperationItem[] = topUps.map((t) => ({
      kind: "topup" as const,
      id: `top:${t.id}`,
      /** Как в сводке/подписи ленты: календарная дата заявки, иначе создание записи — не `decidedAt`, иначе принятие в мае уезжает выше недель марта. */
      sortAt: (t.requestDate ?? t.createdAt).toISOString(),
      requestId: t.id,
      investorId: t.investorId,
      positionName: positionNameById.get(t.investorId) ?? "",
      amount: t.amount,
      status: t.status,
      comment: t.comment,
      createdAt: t.createdAt.toISOString(),
      requestDate: t.requestDate?.toISOString() ?? null,
      decidedAt: t.decidedAt?.toISOString() ?? null,
    }));

    /** Начальное тело при открытии: аудит `CREATE_INVESTOR`, иначе `текущее тело − принятые заявки` (не подмена всего `inv.body` при пустом аудите). */
    const topUpFromCreation: FinanceOperationItem[] = scopedInvestors.flatMap((inv) => {
      const auditJson = firstCreateAuditByInvestorId.get(inv.id) ?? null;
      const invTopUpsForInitial = topUps.filter((t) => t.investorId === inv.id);
      const initialBody = resolveInitialBodyAtCreation({
        createInvestorAuditNewValue: auditJson,
        currentBody: inv.body,
        acceptedBodyTopUpRequests: invTopUpsForInitial,
      });
      if (initialBody == null) return [];
      const openingAnchorMs = Math.min(inv.entryDate.getTime(), inv.activationDate.getTime());
      const openingWeekMonday = getWeekStartMonday(startOfDay(new Date(openingAnchorMs)));
      /** Чуть раньше первой недельной строки леджера, чтобы «вход тела» всегда был ниже по времени, чем начисление за ту же неделю (лента по `sortAt` desc). */
      const initialTopupSortAt = new Date(openingWeekMonday.getTime() - 1).toISOString();
      return [
        {
          kind: "topup" as const,
          id: `top:initial:${inv.id}`,
          sortAt: initialTopupSortAt,
          requestId: -inv.id,
          investorId: inv.id,
          positionName: investorDisplayHandle(inv) ?? inv.name,
          amount: initialBody,
          status: "completed_at_creation",
          comment: null,
          createdAt: inv.createdAt.toISOString(),
          decidedAt: inv.activationDate.toISOString(),
          initialFromCreation: true,
          entryDate: inv.entryDate.toISOString(),
          activationDate: inv.activationDate.toISOString(),
        },
      ];
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
    setOperationsHistoryCacheEntry(cacheKey, payload);
    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=0, must-revalidate",
    };
    if (investorSelectionMeta?.investorPositions.moreAvailable) {
      headers["X-Thaiinvest-Investor-Selection-Partial"] = "1";
    }
    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("OPERATIONS_HISTORY_ERROR:", error);
    if (isTransientDbError(error)) {
      const stale = cacheKeyForStale ? getOperationsHistoryCacheEntry(cacheKeyForStale) : undefined;
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
