-- AlterTable
ALTER TABLE "Protocol" ADD COLUMN "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN "loggedOn" DATE NOT NULL DEFAULT CURRENT_DATE;

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_hunchId_loggedOn_key" ON "CheckIn"("hunchId", "loggedOn");
