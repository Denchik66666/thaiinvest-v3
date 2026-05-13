/**
 * One-shot: полный срез по инвестору id=2 (Den) — аудит, пользователи top-up, леджер.
 * npx tsx scripts/debug/den-investor-2-full-audit.ts
 */
import "../load-env";
import { prisma } from "@/lib/prisma";
import { buildWeeklyLedgerRows, ledgerAcceptedTopUpsFromPrismaRows } from "@/lib/weekly-ledger-rows";
import { getRateHistoryRowsForLedger } from "@/lib/rate-history-rows-cache";

const INVESTOR_ID = 2;

async function main() {
  const inv = await prisma.investor.findUnique({
    where: { id: INVESTOR_ID },
    include: {
      owner: { select: { id: true, username: true, role: true } },
      investorUser: { select: { id: true, username: true, role: true } },
      linkedUser: { select: { id: true, username: true, role: true } },
      payments: { orderBy: { createdAt: "asc" } },
      topUpRequests: {
        orderBy: { id: "asc" },
        include: {
          createdBy: { select: { id: true, username: true, role: true } },
          decidedBy: { select: { id: true, username: true, role: true } },
        },
      },
    },
  });

  if (!inv) {
    console.log(JSON.stringify({ error: "investor not found" }, null, 2));
    process.exit(1);
  }

  const accruals = await prisma.accrual.findMany({
    where: { investorId: INVESTOR_ID },
    orderBy: { cycleStart: "asc" },
  });

  const auditsInvestor = await prisma.auditLog.findMany({
    where: { entityType: "Investor", entityId: INVESTOR_ID },
    orderBy: { id: "asc" },
    include: { user: { select: { id: true, username: true, role: true } } },
  });

  const topUpIds = inv.topUpRequests.map((t) => t.id);
  const auditsTopUps =
    topUpIds.length > 0
      ? await prisma.auditLog.findMany({
          where: { entityType: "BodyTopUpRequest", entityId: { in: topUpIds } },
          orderBy: { id: "asc" },
          include: { user: { select: { id: true, username: true, role: true } } },
        })
      : [];

  const auditsPayments = await prisma.auditLog.findMany({
    where: { entityType: "Payment", entityId: { in: inv.payments.map((p) => p.id) } },
    orderBy: { id: "asc" },
    include: { user: { select: { id: true, username: true, role: true } } },
  });

  const rateHistory = await getRateHistoryRowsForLedger();

  const ledgerRows = buildWeeklyLedgerRows(
    {
      activationDate: inv.activationDate,
      body: inv.body,
      rate: inv.rate,
      isPrivate: inv.isPrivate,
      payments: inv.payments.map((p) => ({
        status: p.status,
        type: p.type,
        amount: p.amount,
        createdAt: p.createdAt,
        approvedAt: p.approvedAt,
        acceptedAt: p.acceptedAt,
      })),
      acceptedBodyTopUps: ledgerAcceptedTopUpsFromPrismaRows(
        inv.topUpRequests.map((t) => ({
          amount: t.amount,
          status: t.status,
          requestDate: t.requestDate,
          decidedAt: t.decidedAt,
          createdAt: t.createdAt,
        }))
      ),
    },
    rateHistory,
    new Date()
  );

  const sumInterestCompleted = inv.payments
    .filter((p) => p.status === "completed" && p.type === "interest")
    .reduce((s, p) => s + p.amount, 0);
  const sumBodyCompleted = inv.payments
    .filter((p) => p.status === "completed" && p.type === "body")
    .reduce((s, p) => s + p.amount, 0);

  console.log(
    JSON.stringify(
      {
        investor: {
          id: inv.id,
          name: inv.name,
          handle: inv.handle,
          body: inv.body,
          accrued: inv.accrued,
          paid: inv.paid,
          rateOnPosition: inv.rate,
          status: inv.status,
          isPrivate: inv.isPrivate,
          entryDate: inv.entryDate.toISOString(),
          activationDate: inv.activationDate.toISOString(),
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          owner: inv.owner,
          investorUser: inv.investorUser,
          linkedUser: inv.linkedUser,
        },
        bodyTopUpRequests: inv.topUpRequests.map((t) => ({
          id: t.id,
          amount: t.amount,
          status: t.status,
          requestDate: t.requestDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          decidedAt: t.decidedAt?.toISOString() ?? null,
          comment: t.comment,
          createdBy: t.createdBy,
          decidedBy: t.decidedBy,
        })),
        payments: inv.payments.map((p) => ({
          id: p.id,
          type: p.type,
          amount: p.amount,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          approvedAt: p.approvedAt?.toISOString() ?? null,
          acceptedAt: p.acceptedAt?.toISOString() ?? null,
          comment: p.comment,
        })),
        accrualsTable: accruals.map((a) => ({
          id: a.id,
          cycleStart: a.cycleStart.toISOString(),
          cycleEnd: a.cycleEnd.toISOString(),
          bodyAmount: a.bodyAmount,
          rate: a.rate,
          amount: a.amount,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
        })),
        auditLogInvestor: auditsInvestor.map((a) => ({
          id: a.id,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
          user: a.user,
          oldValue: a.oldValue?.slice(0, 500) ?? null,
          newValue: a.newValue?.slice(0, 800) ?? null,
        })),
        auditLogBodyTopUp: auditsTopUps.map((a) => ({
          id: a.id,
          entityId: a.entityId,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
          user: a.user,
          newValue: a.newValue?.slice(0, 600) ?? null,
        })),
        auditLogPayment: auditsPayments.map((a) => ({
          id: a.id,
          entityId: a.entityId,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
          user: a.user,
          newValue: a.newValue?.slice(0, 600) ?? null,
        })),
        weeklyLedgerComputed: ledgerRows,
        rateHistoryGlobalSample: rateHistory.slice(0, 15),
        totalsFromPayments: {
          completedInterestSum: sumInterestCompleted,
          completedBodySum: sumBodyCompleted,
        },
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
