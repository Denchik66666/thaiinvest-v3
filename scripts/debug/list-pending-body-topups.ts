/**
 * Список заявок на пополнение тела: все pending_investor и близкие к 100k по сумме.
 * npx tsx scripts/debug/list-pending-body-topups.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const pending = await prisma.bodyTopUpRequest.findMany({
    where: { status: "pending_investor" },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      investorId: true,
      amount: true,
      status: true,
      comment: true,
      createdAt: true,
      decidedAt: true,
      investor: {
        select: {
          name: true,
          body: true,
          linkedUserId: true,
          investorUserId: true,
          ownerId: true,
          isPrivate: true,
          status: true,
        },
      },
      createdBy: { select: { id: true, username: true } },
    },
  });

  const near100k = await prisma.bodyTopUpRequest.findMany({
    where: { amount: { gte: 99_500, lte: 100_500 } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      investorId: true,
      amount: true,
      status: true,
      createdAt: true,
      investor: { select: { name: true } },
    },
  });

  console.log(
    JSON.stringify(
      {
        pending_investor_count: pending.length,
        pending_investor: pending,
        amounts_near_100000: near100k,
      },
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
