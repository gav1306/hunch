-- Additive only. Every existing hypothesis was built as a scheduled trial and
-- every existing parameter is an outcome or a context tracker.
ALTER TABLE "Hypothesis" ADD COLUMN "schedulable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Parameter" ADD COLUMN "isExposure" BOOLEAN NOT NULL DEFAULT false;
