/**
 * Принудительный пересчёт `Investor.accrued` для всех позиций из `recalculateInvestorAccruedFromRateHistory`.
 *
 * Запуск: npx tsx scripts/recalculate-accrued-all.ts
 */
import "./load-env";

import { prisma } from "@/lib/prisma";
import { recalculateInvestorAccruedFromRateHistory } from "@/lib/business-rate-accrual-recalc";

async function main() {
  console.log("Running recalculateInvestorAccruedFromRateHistory() …");
  await recalculateInvestorAccruedFromRateHistory();
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
