-- CreateTable
CREATE TABLE "Hunch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "outcomeMetric" TEXT NOT NULL,
    "outcomeType" TEXT NOT NULL,
    "confounders" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "design" JSONB NOT NULL,
    "powerInfo" JSONB,
    "safetyState" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CausalEdge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "effectSize" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "sourceHunchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CausalEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hunch_userId_idx" ON "Hunch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Hypothesis_hunchId_key" ON "Hypothesis"("hunchId");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_hunchId_key" ON "Protocol"("hunchId");

-- CreateIndex
CREATE INDEX "CheckIn_hunchId_loggedAt_idx" ON "CheckIn"("hunchId", "loggedAt");

-- CreateIndex
CREATE INDEX "CausalEdge_userId_idx" ON "CausalEdge"("userId");

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
