-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Investor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "phone" TEXT,
    "body" REAL NOT NULL,
    "rate" REAL NOT NULL,
    "accrued" REAL NOT NULL DEFAULT 0,
    "paid" REAL NOT NULL DEFAULT 0,
    "entryDate" DATETIME NOT NULL,
    "activationDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Investor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Investor" ("accrued", "activationDate", "body", "createdAt", "entryDate", "handle", "id", "isPrivate", "name", "ownerId", "phone", "rate", "status", "updatedAt") SELECT "accrued", "activationDate", "body", "createdAt", "entryDate", "handle", "id", "isPrivate", "name", "ownerId", "phone", "rate", "status", "updatedAt" FROM "Investor";
DROP TABLE "Investor";
ALTER TABLE "new_Investor" RENAME TO "Investor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
