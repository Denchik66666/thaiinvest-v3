import { prisma } from "@/lib/prisma";

export type PrivateInvestorCreateContext =
  | { ok: false; code: "NO_COMMON_INVESTOR"; message: string }
  | {
      ok: true;
      commonInvestorId: number;
      commonInvestorName: string;
      commonBody: number;
      commonRatePercent: number;
      privateBodiesTotal: number;
      /** Сколько ещё можно суммарно разместить в личной сети (тело общей позиции минус уже в личной). */
      remainingForPrivate: number;
      /** Ставка, которая запишется в карточку личного инвестора (= половина ставки общей позиции). */
      privateAppliedRatePercent: number;
    };

/**
 * Та же логика, что при POST /api/investors для SUPER_ADMIN + личная сеть.
 */
export async function getPrivateInvestorCreateContext(userId: number): Promise<PrivateInvestorCreateContext> {
  const adminMainInvestor = await prisma.investor.findFirst({
    where: {
      isPrivate: false,
      OR: [{ ownerId: userId }, { linkedUserId: userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!adminMainInvestor) {
    return {
      ok: false,
      code: "NO_COMMON_INVESTOR",
      message:
        "Сначала создайте вклад в общей сети (позиция у Семёна), затем добавляйте личных инвесторов.",
    };
  }

  const privateSum = await prisma.investor.aggregate({
    _sum: { body: true },
    where: { ownerId: userId, isPrivate: true },
  });

  const privateBodiesTotal = privateSum._sum.body ?? 0;
  const remainingForPrivate = Math.max(0, adminMainInvestor.body - privateBodiesTotal);

  return {
    ok: true,
    commonInvestorId: adminMainInvestor.id,
    commonInvestorName: adminMainInvestor.name,
    commonBody: adminMainInvestor.body,
    commonRatePercent: adminMainInvestor.rate,
    privateBodiesTotal,
    remainingForPrivate,
    privateAppliedRatePercent: adminMainInvestor.rate / 2,
  };
}
