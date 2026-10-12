-- Reminders now go only to verified addresses, and verification emails start
-- with this release. Accounts made before it were never sent a link, so they
-- are treated as verified rather than having their reminders stop silently.
UPDATE "user" SET "emailVerified" = true WHERE "emailVerified" = false;
