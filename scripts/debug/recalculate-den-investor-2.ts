/**
 * Пересчёт позиции Den (investor id=2) по канону дат и пополнения + обновление accrued/paid в БД.
 * npx tsx scripts/debug/recalculate-den-investor-2.ts
 */
import "../load-env";
import { prisma } from "@/lib/prisma";
import {
  buildWeeklyLedgerRows,
  ledgerAcceptedTopUpsFromPrismaRows,
  type WeeklyLedgerPaymentInput,
} from "@/lib/weekly-ledger-rows";
import { moneyRound2 } from "@/lib/money-round";
import { computeInvestorPaidCompletedTotal } from "@/lib/investor-accrued-ledger";
import { invalidateRateHistoryRowsCache } from "@/lib/rate-history-rows-cache";

const INVESTOR_ID = 2;
/** Слой 1: дата активации / создания позиции */
const ENTRY_ACTIVATION = new Date(Date.UTC(2026, 1, 2, 0, 0, 0, 0));
/** Слой 1: дата пополнения +100k (календарная) */
const TOPUP_REQUEST_DATE = new Date(Date.UTC(2026, 2, 4, 12, 0, 0, 0));

async function main() {
  invalidateRateHistoryRowsCache();

  const [rateHistory, topUpsAll] = await Promise.all([
    prisma.rateHistory.findMany({
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      select: { effectiveDate: true, newRate: true },
    }),
    prisma.bodyTopUpRequest.findMany({
      where: { investorId: INVESTOR_ID },
      select: { id: true, amount: true, status: true, requestDate: true, decidedAt: true, createdAt: true },
    }),
  ]);

  const investor = await prisma.investor.findUnique({
    where: { id: INVESTOR_ID },
    include: { payments: true },
  });
  if (!investor) {
    console.error("Investor 2 not found");
    process.exit(1);
  }

  await prisma.investor.update({
    where: { id: INVESTOR_ID },
    data: {
      entryDate: ENTRY_ACTIVATION,
      activationDate: ENTRY_ACTIVATION,
    },
  });

  for (const t of topUpsAll) {
    if (t.status === "accepted_by_investor") {
      await prisma.bodyTopUpRequest.update({
        where: { id: t.id },
        data: { requestDate: TOPUP_REQUEST_DATE },
      });
    }
  }

  const fresh = await prisma.investor.findUnique({
    where: { id: INVESTOR_ID },
    include: { payments: true },
  });
  if (!fresh) throw new Error("missing investor after update");

  const topUpsAfter = await prisma.bodyTopUpRequest.findMany({
    where: { investorId: INVESTOR_ID },
    select: { amount: true, status: true, requestDate: true, decidedAt: true, createdAt: true },
  });
  const rows = buildWeeklyLedgerRows(
    {
      activationDate: fresh.activationDate,
      body: fresh.body,
      rate: fresh.rate,
      isPrivate: fresh.isPrivate,
      payments: fresh.payments as WeeklyLedgerPaymentInput[],
      acceptedBodyTopUps: ledgerAcceptedTopUpsFromPrismaRows(topUpsAfter),
    },
    rateHistory,
    new Date()
  );

  const newAccrued = Math.round(moneyRound2(rows.length ? rows[rows.length - 1]!.accruedEnd : 0));
  const newPaid = computeInvestorPaidCompletedTotal(fresh.payments);

  await prisma.investor.update({
    where: { id: INVESTOR_ID },
    data: { accrued: newAccrued, paid: newPaid },
  });

  console.log(
    JSON.stringify(
      {
        updated: { entryDate: ENTRY_ACTIVATION.toISOString(), activationDate: ENTRY_ACTIVATION.toISOString() },
        topupRequestDateSet: TOPUP_REQUEST_DATE.toISOString(),
        weeklyRows: rows.map((r) => ({
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          bodyStart: r.bodyStart,
          weeklyRatePercent: r.weeklyRatePercent,
          networkRatePercent: r.networkRatePercent,
          accruedAdded: r.accruedAdded,
          interestPaid: r.interestPaid,
          accruedEnd: r.accruedEnd,
          bodyEnd: r.bodyEnd,
        })),
        investorAfter: { body: fresh.body, accrued: newAccrued, paid: newPaid },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
