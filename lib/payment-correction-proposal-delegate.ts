import type { PrismaClient } from "@prisma/client";

/**
 * После `prisma generate` без перезапуска dev старый singleton Prisma может не содержать делегат модели.
 * Тогда обращение к prisma.paymentCorrectionProposal даёт undefined → TypeError при findMany.
 */
export function getPaymentCorrectionProposalDelegate(
  client: PrismaClient
): typeof client.paymentCorrectionProposal | null {
  const d = (client as unknown as { paymentCorrectionProposal?: typeof client.paymentCorrectionProposal })
    .paymentCorrectionProposal;
  if (!d || typeof (d as { findMany?: unknown }).findMany !== "function") return null;
  return d;
}
