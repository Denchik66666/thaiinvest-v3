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
      /** Для записи «тело при создании» без заявки используется `-investorId`. */
      requestId: number;
      investorId: number;
      positionName: string;
      amount: number;
      status: string;
      comment: string | null;
      createdAt: string;
      decidedAt: string | null;
      /** Начальное тело при создании позиции (не отдельная заявка BodyTopUpRequest). */
      initialFromCreation?: boolean;
      entryDate?: string;
      activationDate?: string;
    };
