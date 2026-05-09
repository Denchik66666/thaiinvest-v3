/**
 * GET /api/investors/operations-summary
 *
 * Тело: `{ byInvestorId: Record<string, SummaryRow>, meta?: { investorSelection } }`.
 * Условия `meta` и заголовка `X-Thaiinvest-Investor-Selection-Partial` — как у operations-history.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { superAdminFinanceMaxPositions } from "@/lib/super-admin-finance-limits";
import { getRateHistoryRowsForLedger } from "@/lib/rate-history-rows-cache";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { buildWeeklyLedgerRows, type WeeklyLedgerPaymentInput } from "@/lib/weekly-ledger-rows";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";
import type { FinanceInvestorSelectionMeta, OperationsSummaryResponse } from "@/types/operations-finance-api";
import type { PeriodPreset, HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";

type SummaryRow = { growth: number; paidOut: number; openRequests: number };

type CacheEntry = { expiresAt: number; payload: OperationsSummaryResponse };
const CACHE_TTL_MS = 45_000;
const memoryCache = new Map<string, CacheEntry>();

function cacheKey(parts: {
  userId: number;
  role: string;
  idsParam: string;
  periodRaw: string;
  filter: string;
  /** SUPER_ADMIN: «общая / личная / все» — без этого сводка мешает разным вкладкам финансов. */
  network?: string;
}) {
  const net = parts.role === "SUPER_ADMIN" && parts.network ? parts.network : "";
  return `${parts.userId}:${parts.role}:${parts.idsParam}:${parts.periodRaw}:${parts.filter}:${net}`;
}

function periodStartMs(p: PeriodPreset): number | null {
  if (p === "all") return null;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 365;
  return Date.now() - days * 86400000;
}

function parseYmd(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function sortAtInHistoryPeriod(sortAtIso: string, period: HistoryPeriodValue): boolean {
  const t = new Date(sortAtIso).getTime();
  if (period.kind === "preset") {
    const start = periodStartMs(period.preset);
    if (start == null) return true;
    return t >= start;
  }
  const fromD = parseYmd(period.fromYmd);
  const toD = parseYmd(period.toYmd);
  if (!fromD || !toD) return true;
  return t >= startOfDayMs(fromD) && t <= endOfDayMs(toD);
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null;
}

function parsePeriod(raw: string | null): HistoryPeriodValue {
  if (!raw) return { kind: "preset", preset: "all" };
  try {
    const j: unknown = JSON.parse(raw);
    if (!isRecord(j)) return { kind: "preset", preset: "all" };
    if (j.kind === "preset" && typeof j.preset === "string") {
      return j as HistoryPeriodValue;
    }
    if (j.kind === "range" && typeof j.fromYmd === "string" && typeof j.toYmd === "string") {
      return j as HistoryPeriodValue;
    }
  } catch {
    // ignore
  }
  return { kind: "preset", preset: "all" };
}

function parseOpFilter(raw: string | null): FinanceOperationsHistoryOpFilter {
  if (raw === "all" || raw === "accrual" || raw === "topup" || raw === "payout" || raw === "request") return raw;
  return "all";
}

function openPaymentStatus(status: string) {
  return status !== "completed";
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

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "INVESTOR" && decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const periodRaw = sp.get("period") ?? "";
    const filterRaw = sp.get("filter") ?? "all";
    const period = parsePeriod(periodRaw);
    const opFilter = parseOpFilter(filterRaw);

    const networkRaw = sp.get("network");
    const superAdminNetwork =
      decoded.role === "SUPER_ADMIN" &&
      (networkRaw === "private" || networkRaw === "common" || networkRaw === "all")
        ? networkRaw
        : decoded.role === "SUPER_ADMIN"
          ? "common"
          : "";

    const idsParamRaw = sp.get("ids") ?? "";
    const key = cacheKey({
      userId: decoded.userId,
      role: decoded.role,
      idsParam: idsParamRaw,
      periodRaw,
      filter: opFilter,
      network: superAdminNetwork || undefined,
    });
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
        },
      });
    }

    let investorsWhere: Prisma.InvestorWhereInput;
    if (decoded.role === "INVESTOR") {
      investorsWhere = { investorUserId: decoded.userId };
    } else if (decoded.role === "OWNER") {
      investorsWhere = { ownerId: decoded.userId };
    } else if (decoded.role === "SUPER_ADMIN") {
      if (superAdminNetwork === "common") investorsWhere = { isPrivate: false };
      else if (superAdminNetwork === "private") investorsWhere = { isPrivate: true };
      else investorsWhere = {};
    } else {
      investorsWhere = {};
    }

    const idListFromParam =
      idsParamRaw?.trim() !== ""
        ? idsParamRaw
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0 && Number.isInteger(n))
        : [];

    let investorWhere: Prisma.InvestorWhereInput = investorsWhere;
    if (idListFromParam.length > 0) {
      investorWhere = { AND: [investorsWhere, { id: { in: idListFromParam } }] };
    }

    const superAdminAllNetworkUnscoped =
      decoded.role === "SUPER_ADMIN" && superAdminNetwork === "all" && idListFromParam.length === 0;
    const cap = superAdminFinanceMaxPositions();
    const takeFetch = superAdminAllNetworkUnscoped ? cap + 1 : undefined;

    const investorsRaw = await withDbRetry(() =>
      prisma.investor.findMany({
        where: investorWhere,
        select: {
          id: true,
          activationDate: true,
          entryDate: true,
          createdAt: true,
          body: true,
          rate: true,
          isPrivate: true,
          payments: {
            select: {
              id: true,
              status: true,
              type: true,
              amount: true,
              createdAt: true,
              approvedAt: true,
              acceptedAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: superAdminAllNetworkUnscoped ? { updatedAt: "desc" } : { createdAt: "desc" },
        take: takeFetch,
      })
    );

    let moreAvailable = false;
    let investors = investorsRaw;
    if (superAdminAllNetworkUnscoped) {
      moreAvailable = investorsRaw.length > cap;
      investors = moreAvailable ? investorsRaw.slice(0, cap) : investorsRaw;
    }

    const investorSelectionMeta: FinanceInvestorSelectionMeta | undefined = superAdminAllNetworkUnscoped
      ? {
          investorPositions: {
            moreAvailable,
            included: investors.length,
            limit: cap,
            orderBy: "updatedAt_desc",
          },
        }
      : undefined;

    const scoped = investors;

    if (scoped.length === 0) {
      return NextResponse.json(
        { byInvestorId: {} satisfies Record<string, SummaryRow> } satisfies OperationsSummaryResponse
      );
    }

    const ids = scoped.map((i) => i.id);

    const [rateHistory, topUps, createInvestorAudits] = await withDbRetry(() =>
      Promise.all([
        getRateHistoryRowsForLedger(),
        prisma.bodyTopUpRequest.findMany({
          where: { investorId: { in: ids } },
          select: { investorId: true, amount: true, createdAt: true, decidedAt: true, status: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.auditLog.findMany({
          where: {
            entityType: "Investor",
            entityId: { in: ids },
            action: "CREATE_INVESTOR",
          },
          orderBy: { createdAt: "asc" },
          select: { entityId: true, newValue: true },
        }),
      ])
    );

    const firstCreateAuditByInvestorId = new Map<number, string | null>();
    for (const row of createInvestorAudits) {
      if (!firstCreateAuditByInvestorId.has(row.entityId)) {
        firstCreateAuditByInvestorId.set(row.entityId, row.newValue);
      }
    }

    const topUpsByInv = new Map<number, typeof topUps>();
    for (const t of topUps) {
      const list = topUpsByInv.get(t.investorId) ?? [];
      list.push(t);
      topUpsByInv.set(t.investorId, list);
    }

    const byInvestorId: Record<string, SummaryRow> = {};

    for (const inv of scoped) {
      // accrual weeks
      const weeks = buildWeeklyLedgerRows(
        {
          activationDate: inv.activationDate,
          body: inv.body,
          rate: inv.rate,
          isPrivate: inv.isPrivate,
          payments: inv.payments as WeeklyLedgerPaymentInput[],
        },
        rateHistory,
        new Date()
      );

      const accrualGrowth = weeks.reduce((s, w) => (sortAtInHistoryPeriod(w.weekStart, period) ? s + w.accruedAdded : s), 0);

      const invTopups = topUpsByInv.get(inv.id) ?? [];
      const topupGrowth = invTopups.reduce((s, t) => {
        const sortAt = (t.decidedAt ?? t.createdAt).toISOString();
        if (!sortAtInHistoryPeriod(sortAt, period)) return s;
        return s + t.amount;
      }, 0);

      // Начальное тело при создании позиции — в ленте идёт как пополнение (без BodyTopUpRequest).
      const auditJson = firstCreateAuditByInvestorId.get(inv.id) ?? null;
      const initialBody = parseInitialBodyFromAudit(auditJson) ?? inv.body;
      const initialTopupAt = inv.activationDate.toISOString();
      const initialTopup = sortAtInHistoryPeriod(initialTopupAt, period) ? initialBody : 0;

      const paidOut = inv.payments.reduce((s, p) => {
        if (!sortAtInHistoryPeriod(p.createdAt.toISOString(), period)) return s;
        if (p.status !== "completed") return s;
        return s + p.amount;
      }, 0);

      const openRequests = inv.payments.reduce((s, p) => {
        if (!sortAtInHistoryPeriod(p.createdAt.toISOString(), period)) return s;
        if (!openPaymentStatus(p.status)) return s;
        return s + 1;
      }, 0);

      const rowAll: SummaryRow = { growth: accrualGrowth + topupGrowth + initialTopup, paidOut, openRequests };

      let row: SummaryRow;
      if (opFilter === "all") row = rowAll;
      else if (opFilter === "accrual") row = { growth: accrualGrowth, paidOut: 0, openRequests: 0 };
      else if (opFilter === "topup") row = { growth: topupGrowth + initialTopup, paidOut: 0, openRequests: 0 };
      else if (opFilter === "payout") row = { growth: 0, paidOut, openRequests: 0 };
      else row = { growth: 0, paidOut: 0, openRequests }; // request

      byInvestorId[String(inv.id)] = row;
    }

    const payload: OperationsSummaryResponse = {
      byInvestorId,
      ...(investorSelectionMeta ? { meta: { investorSelection: investorSelectionMeta } } : {}),
    };
    memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
    };
    if (investorSelectionMeta?.investorPositions.moreAvailable) {
      headers["X-Thaiinvest-Investor-Selection-Partial"] = "1";
    }
    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("OPERATIONS_SUMMARY_ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

