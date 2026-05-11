-- Календарная дата заявки на пополнение (выбор владельца), отдельно от фактического createdAt записи.
ALTER TABLE "BodyTopUpRequest" ADD COLUMN "requestDate" TIMESTAMP(3);

UPDATE "BodyTopUpRequest" SET "requestDate" = "createdAt" WHERE "requestDate" IS NULL;
