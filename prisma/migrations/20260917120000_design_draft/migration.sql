-- CreateTable
CREATE TABLE "DesignDraft" (
    "hunchId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignDraft_pkey" PRIMARY KEY ("hunchId")
);

-- AddForeignKey
ALTER TABLE "DesignDraft" ADD CONSTRAINT "DesignDraft_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
