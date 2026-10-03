-- 20260903010000 pinned every scale to 1-5, but nothing stopped a new row
-- arriving as 1-10 afterwards. Writes are normalised now; this catches the
-- rows written in between.
UPDATE "Parameter"
SET "unit" = '1-5', "min" = 1, "max" = 5
WHERE "type" = 'scale' AND ("unit" IS DISTINCT FROM '1-5' OR "min" IS DISTINCT FROM 1 OR "max" IS DISTINCT FROM 5);
