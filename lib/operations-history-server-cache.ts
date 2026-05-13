import type { OperationsHistoryResponse } from "@/types/operations-finance-api";

type CacheEntry = { expiresAt: number; payload: OperationsHistoryResponse };

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export function getOperationsHistoryCacheEntry(key: string): CacheEntry | undefined {
  const e = memoryCache.get(key);
  if (e && e.expiresAt > Date.now()) return e;
  return undefined;
}

export function setOperationsHistoryCacheEntry(key: string, payload: OperationsHistoryResponse): void {
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

/**
 * Сброс серверного кэша GET `/api/investors/operations-history`.
 * Клиент после мутаций вызывает `invalidateQueries`, но без этого следующий GET мог до 60 с отдавать старый JSON из памяти процесса Next.
 */
export function clearOperationsHistoryServerCache(): void {
  memoryCache.clear();
}
