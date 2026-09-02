-- Parameter.type gains three values in place of "continuous", so a rating, a
-- count and a measured amount stop sharing one control and one validator.
--
-- Mirrors backfillKind() in src/lib/parameters.ts: a unit that reads as a
-- rating range becomes a scale; everything else becomes an amount, which is the
-- free number input these rows already rendered. Ordering is load-bearing --
-- the second statement claims every remaining "continuous" row, so the scale
-- rule has to run first.
UPDATE "Parameter"
SET "type" = 'scale'
WHERE "type" = 'continuous'
  AND "unit" ~ '^[0-9]+[[:space:]]*[-–][[:space:]]*[0-9]+$';

UPDATE "Parameter"
SET "type" = 'amount'
WHERE "type" = 'continuous';
