-- Лента операций: Payments по investorId + createdAt; AuditLog CREATE_INVESTOR по сущности.
CREATE INDEX IF NOT EXISTS "Payment_investorId_createdAt_idx" ON "Payment" ("investorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_action_idx" ON "AuditLog" ("entityType", "entityId", "action");
