export type Investor = {
  id: number;
  name: string;
  body: number;
  /** Остаток начисленных процентов (`Investor.accrued`): только закрытые недели, целые баты; выплаты текущей недели уменьшают остаток. Источник расчёта — `computeInvestorAccruedEndFromLedger` / `buildWeeklyLedgerRows` (`lib/investor-accrued-ledger.ts`). */
  accrued: number;
  /** Сумма завершённых выплат по позиции (`Investor.paid`): все типы `Payment` со статусом `completed`; синхронизируется при массовом и PATCH‑пересчёте `accrued` через `computeInvestorPaidCompletedTotal`. */
  paid: number;
  /** Сумма завершённых выплат процентов (для «накопительно начислено» = accrued + lifetimeInterestPaid). */
  lifetimeInterestPaid?: number;
  due: number;
  rate: number;
  status: string;
  entryDate?: string;
  activationDate?: string;
  owner: { id: number; username: string; role: string };
  investorUser?: { id: number; username: string } | null;
  isPrivate?: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
};
