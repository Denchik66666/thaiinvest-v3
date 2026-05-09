import type { Investor } from "@prisma/client";

export type InvestorPaymentScope = Pick<Investor, "ownerId" | "linkedUserId" | "investorUserId" | "isPrivate">;

/** Доступ к операциям по позиции для OWNER / INVESTOR / SUPER_ADMIN (как в /api/payments). */
export function userHasInvestorScopedAccess(
  userId: number,
  role: string,
  investor: InvestorPaymentScope
): boolean {
  if (role === "OWNER") return investor.ownerId === userId;
  if (role === "INVESTOR" || role === "SUPER_ADMIN") {
    return (
      (investor.linkedUserId === userId && !investor.isPrivate) ||
      (investor.ownerId === userId && investor.isPrivate) ||
      investor.investorUserId === userId
    );
  }
  return false;
}
