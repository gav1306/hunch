-- A scale is 1-5 by definition, and validateParameterValue holds every scale
-- reading to that range whatever the row says. But rows migrated off the old
-- free-number type kept their original unit string, so a check-in could render
-- five tap targets under a label advertising "(1-10)".
--
-- The bounds were already being ignored; this makes the label agree with them.
UPDATE "Parameter"
SET "unit" = '1-5', "min" = 1, "max" = 5
WHERE "type" = 'scale' AND ("unit" IS DISTINCT FROM '1-5' OR "min" <> 1 OR "max" <> 5);
