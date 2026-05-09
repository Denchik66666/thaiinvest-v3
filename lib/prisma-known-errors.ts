import { Prisma } from "@prisma/client";

/** P2021: таблица под модель ещё не создана (миграции не применены к этой БД). */
export function isPrismaMissingTableForModel(error: unknown, modelName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2021") return false;
  const meta = error.meta as { modelName?: string } | undefined;
  return meta?.modelName === modelName;
}
