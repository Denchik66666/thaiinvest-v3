import type { PrismaClient } from "@prisma/client";

/** Позиция инвестора в сети: либо кабинет (investorUserId), либо общая привязка (linkedUserId). */
export async function findInvestorSlotForUser(prisma: PrismaClient, userId: number) {
  return prisma.investor.findFirst({
    where: {
      OR: [{ investorUserId: userId }, { linkedUserId: userId }],
    },
    select: { id: true, ownerId: true },
    orderBy: { id: "asc" },
  });
}

export async function getFirstActiveOwner(prisma: PrismaClient) {
  return prisma.user.findFirst({
    where: { role: "OWNER", isArchived: false },
    orderBy: { id: "asc" },
    select: { id: true, username: true },
  });
}
