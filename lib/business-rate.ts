import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";

export interface BusinessRateSnapshot {
  rate: number;
  effectiveDate: Date;
}

export async function getCurrentBusinessRate(atDate: Date = new Date()): Promise<BusinessRateSnapshot | null> {
  const target = startOfDay(atDate);
  const row = await prisma.rateHistory.findFirst({
    where: {
      effectiveDate: {
        lte: target,
      },
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });

  if (!row) return null;

  return {
    rate: row.newRate,
    effectiveDate: row.effectiveDate,
  };
}

export async function upsertBusinessRate(params: {
  changedBy: number;
  newRate: number;
  effectiveDate?: Date;
  comment?: string;
}) {
  const effective = getPreviousOrCurrentMonday(params.effectiveDate ?? new Date());
  const current = await getCurrentBusinessRate(effective);
  const oldRate = current?.rate ?? params.newRate;

  return prisma.rateHistory.create({
    data: {
      changedBy: params.changedBy,
      oldRate,
      newRate: params.newRate,
      effectiveDate: effective,
      comment: params.comment ?? null,
    },
  });
}
