/** Округление денежных Float (Prisma) до 2 знаков — для сравнений и лимитов */
export function moneyRound2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
