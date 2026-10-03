-- An observational trial compares the days the user chose to do something
-- with the days they didn't. Its result is a correlation, and the Coach must
-- not treat it as a tested finding. Existing rows keep "causal": no deployment
-- holds observational edges worth back-filling.
ALTER TABLE "CausalEdge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'causal';
