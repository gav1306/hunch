-- AlterTable
ALTER TABLE "user" ADD COLUMN     "lastReminderOn" DATE,
ADD COLUMN     "reminderHour" INTEGER,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';
