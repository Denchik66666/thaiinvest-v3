-- CreateTable
CREATE TABLE "DatabaseResetConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "passwordHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseResetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseResetLockout" (
    "userId" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "DatabaseResetLockout_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "DatabaseResetLockout" ADD CONSTRAINT "DatabaseResetLockout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
