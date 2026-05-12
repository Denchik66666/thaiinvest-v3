/**
 * Диагностика: investor id=2 (Den) — сырые строки БД для сверки с лентой «Финансы».
 * npx tsx scripts/debug/diagnose-investor-2-operations.ts
 */
import "../load-env";
import { prisma } from "@/lib/prisma";

const INVESTOR_ID = 2;

async function main() {
  const inv = await prisma.investor.findUnique({
    where: { id: INVESTOR_ID },
    select: {
      id: true,
      name: true,
      handle: true,
      body: true,
      accrued: true,
      paid: true,
      rate: true,
      status: true,
      isPrivate: true,
      entryDate: true,
      activationDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!inv) {
    console.log(JSON.stringify({ error: "investor not found", id: INVESTOR_ID }, null, 2));
    process.exit(1);
  }

  const [bodyTopUps, payments, accruals, audits] = await Promise.all([
    prisma.bodyTopUpRequest.findMany({
      where: { investorId: INVESTOR_ID },
      orderBy: { id: "asc" },
    }),
    prisma.payment.findMany({
      where: { investorId: INVESTOR_ID },
      orderBy: { createdAt: "asc" },
    }),
    prisma.accrual.findMany({
      where: { investorId: INVESTOR_ID },
      orderBy: { cycleStart: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "Investor", entityId: INVESTOR_ID, action: "CREATE_INVESTOR" },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, newValue: true, userId: true },
    }),
  ]);

  let auditBodies: { auditId: number; createdAt: string; bodyFromJson: unknown }[] = [];
  for (const a of audits) {
    let bodyFromJson: unknown = null;
    if (a.newValue) {
      try {
        const j = JSON.parse(a.newValue) as { body?: unknown };
        bodyFromJson = j.body ?? null;
      } catch {
        bodyFromJson = "parse_error";
      }
    }
    auditBodies.push({
      auditId: a.id,
      createdAt: a.createdAt.toISOString(),
      bodyFromJson,
    });
  }

  const out = {
    investorSnapshot: {
      ...inv,
      entryDate: inv.entryDate.toISOString(),
      activationDate: inv.activationDate.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    },
    bodyTopUpRequest: bodyTopUps.map((t) => ({
      id: t.id,
      amount: t.amount,
      status: t.status,
      requestDate: t.requestDate?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      decidedAt: t.decidedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
      comment: t.comment,
    })),
    payment: payments.map((p) => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
      comment: p.comment,
    })),
    accrual: accruals.map((r) => ({
      id: r.id,
      cycleStart: r.cycleStart.toISOString(),
      cycleEnd: r.cycleEnd.toISOString(),
      bodyAmount: r.bodyAmount,
      rate: r.rate,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    auditLogCreateInvestor: auditBodies,
    rawCreateInvestorNewValueSample:
      audits[0]?.newValue != null
        ? audits[0].newValue.length > 800
          ? audits[0].newValue.slice(0, 800) + "…(truncated)"
          : audits[0].newValue
        : null,
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
