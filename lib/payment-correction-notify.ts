import type { PrismaClient } from "@prisma/client";

import { canChatWithPeer } from "@/lib/chat-peer-permission";

const MAX_LEN = 2000;

export async function notifyPaymentCorrectionProposal(
  prisma: PrismaClient,
  params: { fromUserId: number; toUserId: number; paymentId: number; adminNote: string }
): Promise<void> {
  const { fromUserId, toUserId, paymentId, adminNote } = params;
  const allowed = await canChatWithPeer(prisma, fromUserId, toUserId);
  if (!allowed) return;

  const body =
    `[Заявка №${paymentId}] Запрос правки от администратора платформы.\n\n` +
    `${adminNote.trim()}\n\n` +
    `Раздел «Финансы»: блок запросов правок над лентой операций.`;

  await prisma.chatMessage.create({
    data: {
      senderId: fromUserId,
      recipientId: toUserId,
      body: body.length > MAX_LEN ? `${body.slice(0, MAX_LEN - 1)}…` : body,
    },
  });
}
