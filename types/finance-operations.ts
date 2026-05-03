export type FinanceOperationItem =
  | {
      kind: "week_accrual";
      id: string;
      sortAt: string;
      weekStart: string;
      weekEnd: string;
      accrued: number;
      paidTotal: number;
      paidInterest: number;
      paidBody: number;
      paidClose: number;
      networkRatePercent?: number;
      syntheticOpen?: boolean;
    }
  | {
      kind: "payment";
      id: string;
      sortAt: string;
      paymentId: number;
      investorId: number;
      positionName: string;
      type: string;
      amount: number;
      status: string;
      comment: string | null;
      createdAt: string;
      approvedAt: string | null;
      acceptedAt: string | null;
    }
  | {
      kind: "topup";
      id: string;
      sortAt: string;
      requestId: number;
      investorId: number;
      positionName: string;
      amount: number;
      status: string;
      comment: string | null;
      createdAt: string;
      decidedAt: string | null;
    }
  | {
      /** Старт позиции при создании инвестора (не BodyTopUpRequest). */
      kind: "position_start";
      id: string;
      sortAt: string;
      investorId: number;
      positionName: string;
      amount: number;
      entryDate: string;
      activationDate: string;
    };
