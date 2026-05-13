-- PaymentCorrectionProposal: запрос правки заявки SUPER_ADMIN → согласование адресатом

CREATE TABLE "PaymentCorrectionProposal" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "assigneeUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCorrectionProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentCorrectionProposal_assigneeUserId_status_idx" ON "PaymentCorrectionProposal"("assigneeUserId", "status");

CREATE INDEX "PaymentCorrectionProposal_paymentId_status_idx" ON "PaymentCorrectionProposal"("paymentId", "status");

ALTER TABLE "PaymentCorrectionProposal" ADD CONSTRAINT "PaymentCorrectionProposal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentCorrectionProposal" ADD CONSTRAINT "PaymentCorrectionProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentCorrectionProposal" ADD CONSTRAINT "PaymentCorrectionProposal_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentCorrectionProposal" ADD CONSTRAINT "PaymentCorrectionProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
