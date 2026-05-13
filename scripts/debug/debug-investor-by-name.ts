/**
 * Поиск инвестора по фрагменту имени: даты, тело, заявки на пополнение, аудит создания.
 * npx tsx scripts/debug/debug-investor-by-name.ts Михайлович
 */
import { prisma } from "@/lib/prisma";

const needle = process.argv[2] ?? "Михайлович";

async function run() {
  const investors = await prisma.investor.findMany({
    where: { name: { contains: needle, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      body: true,
      entryDate: true,
      activationDate: true,
      createdAt: true,
      status: true,
      isPrivate: true,
      investorUserId: true,
      owner: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  if (!investors.length) {
    console.log(JSON.stringify({ needle, found: 0 }, null, 2));
    return;
  }

  for (const inv of investors) {
    const [topUps, audit] = await Promise.all([
      prisma.bodyTopUpRequest.findMany({
        where: { investorId: inv.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, status: true, createdAt: true, decidedAt: true },
      }),
      prisma.auditLog.findFirst({
        where: { entityType: "Investor", entityId: inv.id, action: "CREATE_INVESTOR" },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, newValue: true },
      }),
    ]);

    let auditBody: number | null = null;
    if (audit?.newValue) {
      try {
        const j = JSON.parse(audit.newValue) as { body?: number };
        auditBody = typeof j.body === "number" ? j.body : null;
      } catch {
        auditBody = null;
      }
    }

    console.log(
      JSON.stringify(
        {
          id: inv.id,
          name: inv.name,
          owner: inv.owner.username,
          bodyNow: inv.body,
          bodyFromCreateAudit: auditBody,
          entryDate: inv.entryDate.toISOString(),
          activationDate: inv.activationDate.toISOString(),
          investorCreatedAt: inv.createdAt.toISOString(),
          status: inv.status,
          isPrivate: inv.isPrivate,
          investorUserId: inv.investorUserId,
          bodyTopUpRequestsCount: topUps.length,
          bodyTopUpRequests: topUps,
          hasCreateInvestorAudit: Boolean(audit),
          auditCreatedAt: audit?.createdAt.toISOString() ?? null,
        },
        null,
        2
      )
    );
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
