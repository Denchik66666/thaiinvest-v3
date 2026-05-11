export type Investor = {
  id: number;
  name: string;
  body: number;
  /** Остаток начисленных процентов из БД (`Investor.accrued`): только закрытые недели, целые баты; выплаты текущей недели уменьшают остаток. Обновляет `recalculateInvestorAccruedFromRateHistory`. */
  accrued: number;
  /** Сумма завершённых выплат процентов (для «накопительно начислено» = accrued + lifetimeInterestPaid). */
  lifetimeInterestPaid?: number;
  paid: number;
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
