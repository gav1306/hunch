-- CreateTable
CREATE TABLE "Verdict" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "pEffect" DOUBLE PRECISION NOT NULL,
    "effect" DOUBLE PRECISION NOT NULL,
    "ciLow" DOUBLE PRECISION NOT NULL,
    "ciHigh" DOUBLE PRECISION NOT NULL,
    "nA" INTEGER NOT NULL,
    "nB" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verdict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Verdict_hunchId_key" ON "Verdict"("hunchId");

-- AddForeignKey
ALTER TABLE "Verdict" ADD CONSTRAINT "Verdict_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
