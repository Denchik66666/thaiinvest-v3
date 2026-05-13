-- История ставок: сортировка по effectiveDate + createdAt (ledger / operations-history).
CREATE INDEX IF NOT EXISTS "RateHistory_effectiveDate_createdAt_idx" ON "RateHistory" ("effectiveDate", "createdAt");

-- SUPER_ADMIN common: фильтр isPrivate + сортировка по дате позиции.
CREATE INDEX IF NOT EXISTS "Investor_isPrivate_createdAt_idx" ON "Investor" ("isPrivate", "createdAt" DESC);

-- Лимитированная выборка «последних активных» позиций (ORDER BY updatedAt DESC).
CREATE INDEX IF NOT EXISTS "Investor_updatedAt_idx" ON "Investor" ("updatedAt" DESC);
