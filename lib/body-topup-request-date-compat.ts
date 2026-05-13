import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** БД без миграции `requestDate` — Prisma падает на SELECT/INSERT с этим полем. */
export function isMissingBodyTopUpRequestDateColumn(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (!msg.includes("requestdate")) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("unknown column") ||
    (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022")
  );
}

const historySelectWithDate = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdAt: true,
  requestDate: true,
  decidedAt: true,
} as const;

const historySelectLegacy = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdAt: true,
  decidedAt: true,
} as const;

export type BodyTopUpHistoryRow = {
  id: number;
  investorId: number;
  amount: number;
  status: string;
  comment: string | null;
  createdAt: Date;
  requestDate: Date | null;
  decidedAt: Date | null;
};

export async function findBodyTopUpsForOperationsHistory(investorIds: number[]): Promise<BodyTopUpHistoryRow[]> {
  if (investorIds.length === 0) return [];
  const where = { investorId: { in: investorIds } };
  const orderBy = { createdAt: "desc" as const };
  try {
    return await prisma.bodyTopUpRequest.findMany({ where, select: historySelectWithDate, orderBy });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const rows = await prisma.bodyTopUpRequest.findMany({ where, select: historySelectLegacy, orderBy });
    return rows.map((r) => ({ ...r, requestDate: null }));
  }
}

const summarySelectWithDate = {
  investorId: true,
  amount: true,
  createdAt: true,
  requestDate: true,
  decidedAt: true,
  status: true,
} as const;

const summarySelectLegacy = {
  investorId: true,
  amount: true,
  createdAt: true,
  decidedAt: true,
  status: true,
} as const;

export type BodyTopUpSummaryRow = {
  investorId: number;
  amount: number;
  createdAt: Date;
  requestDate: Date | null;
  decidedAt: Date | null;
  status: string;
};

export async function findBodyTopUpsForOperationsSummary(investorIds: number[]): Promise<BodyTopUpSummaryRow[]> {
  if (investorIds.length === 0) return [];
  const where = { investorId: { in: investorIds } };
  const orderBy = { createdAt: "desc" as const };
  try {
    return await prisma.bodyTopUpRequest.findMany({ where, select: summarySelectWithDate, orderBy });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const rows = await prisma.bodyTopUpRequest.findMany({ where, select: summarySelectLegacy, orderBy });
    return rows.map((r) => ({ ...r, requestDate: null }));
  }
}

const contextInclude = {
  investor: {
    include: {
      owner: { select: { username: true } },
      investorUser: { select: { username: true } },
      linkedUser: { select: { username: true } },
    },
  },
  createdBy: { select: { username: true } },
} as const;

const contextSelectLegacy = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdById: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  investor: contextInclude.investor,
  createdBy: contextInclude.createdBy,
} as const;

/** Строка контекста пополнения: с `requestDate` из БД или `null`, если колонки ещё нет. */
export async function findBodyTopUpRequestForContext(requestId: number) {
  try {
    return await prisma.bodyTopUpRequest.findUnique({
      where: { id: requestId },
      include: contextInclude,
    });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const r = await prisma.bodyTopUpRequest.findUnique({
      where: { id: requestId },
      select: contextSelectLegacy,
    });
    if (!r) return null;
    return { ...r, requestDate: null as Date | null };
  }
}

/** Как в GET `/api/body-topup-requests` — вложенный select инвестора для карточек. */
const ownerFeedInvestorSelect = {
  id: true,
  name: true,
  handle: true,
  body: true,
  ownerId: true,
  linkedUserId: true,
  investorUserId: true,
  isPrivate: true,
  investorUser: { select: { username: true, avatarUrl: true } },
  linkedUser: { select: { username: true, avatarUrl: true } },
} as const;

const ownerFeedInclude = {
  investor: { select: ownerFeedInvestorSelect },
  createdBy: { select: { id: true, username: true, role: true } },
  decidedBy: { select: { id: true, username: true, role: true } },
} as const;

const ownerFeedSelectLegacy = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdById: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  investor: { select: ownerFeedInvestorSelect },
  createdBy: { select: { id: true, username: true, role: true } },
  decidedBy: { select: { id: true, username: true, role: true } },
} as const;

export async function findBodyTopUpsForOwnerFeed(where: Prisma.BodyTopUpRequestWhereInput) {
  const orderBy = { createdAt: "desc" as const };
  try {
    return await prisma.bodyTopUpRequest.findMany({ where, include: ownerFeedInclude, orderBy });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const rows = await prisma.bodyTopUpRequest.findMany({ where, select: ownerFeedSelectLegacy, orderBy });
    return rows.map((r) => ({ ...r, requestDate: null as Date | null }));
  }
}

/** Для PATCH: полная модель `investor` для проверки прав. */
export async function findBodyTopUpRequestForPatch(requestId: number) {
  try {
    return await prisma.bodyTopUpRequest.findUnique({
      where: { id: requestId },
      include: { investor: true },
    });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const r = await prisma.bodyTopUpRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        investorId: true,
        amount: true,
        status: true,
        comment: true,
        createdById: true,
        decidedById: true,
        decidedAt: true,
        createdAt: true,
        updatedAt: true,
        investor: true,
      },
    });
    if (!r) return null;
    return { ...r, requestDate: null as Date | null };
  }
}

type CreateBodyTopUpBase = {
  investorId: number;
  amount: number;
  status: string;
  comment: string | null;
  createdById: number;
};

const ownerFeedSelectWithRequestDate = {
  ...ownerFeedSelectLegacy,
  requestDate: true,
} as const;

/** Ответ PATCH / аудит: без `requestDate` в RETURNING — не падает, если миграция ещё не накатана. */
export const bodyTopUpRequestUpdateReturnSelect = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdById: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createBodyTopUpRequestWithDateCompat(
  base: CreateBodyTopUpBase,
  requestCalendarAt: Date | undefined
) {
  const data = {
    ...base,
    ...(requestCalendarAt ? { requestDate: requestCalendarAt } : {}),
  };
  try {
    return await prisma.bodyTopUpRequest.create({
      data,
      select: ownerFeedSelectWithRequestDate,
    });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    return prisma.bodyTopUpRequest
      .create({
        data: { ...base },
        select: ownerFeedSelectLegacy,
      })
      .then((r) => ({ ...r, requestDate: null as Date | null }));
  }
}

const reportsFeedRelSelect = {
  investor: {
    select: {
      id: true,
      name: true,
      body: true,
      ownerId: true,
      linkedUserId: true,
      investorUserId: true,
      isPrivate: true,
    },
  },
  createdBy: { select: { id: true, username: true, role: true } },
  decidedBy: { select: { id: true, username: true, role: true } },
} as const;

const reportsFeedSelectWithDate = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdById: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  requestDate: true,
  investor: reportsFeedRelSelect.investor,
  createdBy: reportsFeedRelSelect.createdBy,
  decidedBy: reportsFeedRelSelect.decidedBy,
} as const;

const reportsFeedSelectLegacy = {
  id: true,
  investorId: true,
  amount: true,
  status: true,
  comment: true,
  createdById: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  investor: reportsFeedRelSelect.investor,
  createdBy: reportsFeedRelSelect.createdBy,
  decidedBy: reportsFeedRelSelect.decidedBy,
} as const;

/** Лента отчётов: раньше был `include` и Prisma тянул все скаляры, включая отсутствующую `requestDate`. */
export async function findBodyTopUpsForReportsFeed(args: {
  where?: Prisma.BodyTopUpRequestWhereInput;
  take: number;
}) {
  const orderBy = { createdAt: "desc" as const };
  const base = { where: args.where, take: args.take, orderBy };
  try {
    return await prisma.bodyTopUpRequest.findMany({ ...base, select: reportsFeedSelectWithDate });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const rows = await prisma.bodyTopUpRequest.findMany({ ...base, select: reportsFeedSelectLegacy });
    return rows.map((r) => ({ ...r, requestDate: null as Date | null }));
  }
}

const investorDetailTopUpSelectWithDate = {
  id: true,
  amount: true,
  status: true,
  comment: true,
  createdAt: true,
  decidedAt: true,
  requestDate: true,
} as const;

const investorDetailTopUpSelectLegacy = {
  id: true,
  amount: true,
  status: true,
  comment: true,
  createdAt: true,
  decidedAt: true,
} as const;

/** Карточка инвестора GET: последние заявки на пополнение с календарной датой. */
export async function findBodyTopUpsForInvestorDetail(investorId: number) {
  const where = { investorId };
  const orderBy = { createdAt: "desc" as const };
  const take = 30;
  try {
    return await prisma.bodyTopUpRequest.findMany({ where, orderBy, take, select: investorDetailTopUpSelectWithDate });
  } catch (e) {
    if (!isMissingBodyTopUpRequestDateColumn(e)) throw e;
    const rows = await prisma.bodyTopUpRequest.findMany({
      where,
      orderBy,
      take,
      select: investorDetailTopUpSelectLegacy,
    });
    return rows.map((r) => ({ ...r, requestDate: null as Date | null }));
  }
}
