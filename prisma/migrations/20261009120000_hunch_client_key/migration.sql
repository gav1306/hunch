-- The new-hunch form's idempotency key. Unique per user; Postgres treats NULLs
-- as distinct, so every existing hunch (all NULL) stays valid.
ALTER TABLE "Hunch" ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "Hunch_userId_clientKey_key" ON "Hunch"("userId", "clientKey");
