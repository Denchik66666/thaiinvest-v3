-- Ускорение GET /api/investors (lean): агрегации Payment по investorId/status/type.
CREATE INDEX IF NOT EXISTS "Payment_investorId_status_idx" ON "Payment" ("investorId", "status");
CREATE INDEX IF NOT EXISTS "Payment_investorId_status_type_idx" ON "Payment" ("investorId", "status", "type");

-- Фильтр владельца: общая сеть (ownerId + isPrivate).
CREATE INDEX IF NOT EXISTS "Investor_ownerId_isPrivate_idx" ON "Investor" ("ownerId", "isPrivate");
