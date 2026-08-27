-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInValue" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CheckInValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parameter_hunchId_idx" ON "Parameter"("hunchId");

-- CreateIndex
CREATE INDEX "CheckInValue_parameterId_idx" ON "CheckInValue"("parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInValue_checkInId_parameterId_key" ON "CheckInValue"("checkInId", "parameterId");

-- AddForeignKey
ALTER TABLE "Parameter" ADD CONSTRAINT "Parameter_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInValue" ADD CONSTRAINT "CheckInValue_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInValue" ADD CONSTRAINT "CheckInValue_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing hypothesis becomes one primary parameter.
INSERT INTO "Parameter" ("id", "hunchId", "label", "type", "unit", "min", "max", "isPrimary", "sortOrder")
SELECT gen_random_uuid()::text, h."hunchId", h."outcomeMetric", h."outcomeType", NULL, NULL, NULL, true, 0
FROM "Hypothesis" h;

-- Backfill: every existing reading moves onto its hunch's primary parameter.
INSERT INTO "CheckInValue" ("id", "checkInId", "parameterId", "value")
SELECT gen_random_uuid()::text, c."id", p."id", c."value"
FROM "CheckIn" c
JOIN "Parameter" p ON p."hunchId" = c."hunchId" AND p."isPrimary" = true;

-- DropColumn (superseded by CheckInValue)
ALTER TABLE "CheckIn" DROP COLUMN "value";
