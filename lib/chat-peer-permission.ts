import type { PrismaClient } from "@prisma/client";

import { findInvestorSlotForUser, getFirstActiveOwner } from "@/lib/chat-network";

/**
 * Та же логика, что при отправке сообщения: можно ли переписываться с peer.
 */
export async function canChatWithPeer(db: PrismaClient, me: number, peerId: number): Promise<boolean> {
  if (peerId === me) return false;

  const recipient = await db.user.findFirst({
    where: { id: peerId, isArchived: false },
  });
  if (!recipient) return false;

  const meUser = await db.user.findUnique({ where: { id: me }, select: { role: true } });
  if (!meUser) return false;

  if (meUser.role === "SUPER_ADMIN") return true;
  if (meUser.role === "OWNER" && recipient.role === "SUPER_ADMIN") return true;
  if (meUser.role === "INVESTOR" && recipient.role === "OWNER") {
    const inv = await db.investor.findFirst({
      where: {
        ownerId: peerId,
        OR: [{ investorUserId: me }, { linkedUserId: me }],
      },
    });
    if (inv) return true;
    const slot = await findInvestorSlotForUser(db, me);
    if (!slot) {
      const fallbackOwner = await getFirstActiveOwner(db);
      return fallbackOwner?.id === peerId;
    }
    return false;
  }
  if (meUser.role === "OWNER" && recipient.role === "INVESTOR") {
    const inv = await db.investor.findFirst({
      where: {
        ownerId: me,
        OR: [{ investorUserId: peerId }, { linkedUserId: peerId }],
      },
    });
    return Boolean(inv);
  }
  return false;
}
