-- Schema-drift fix 1/2: drop the redundant employees name index.
--
-- Background (docs/MIGRATION_DRIFT.md): employees had TWO functionally
-- identical case-insensitive unique indexes, idx_employees_unique_name
-- and employees_name_unique_ci. When this migration ran against live,
-- only employees_name_unique_ci still existed on the database, so this
-- DROP is a no-op on live but is recorded for any future environment
-- that somehow still has the older index.
--
-- NOTE: the training_types.column_key unique constraint originally
-- planned for this migration is intentionally NOT applied. Live data
-- contains two legitimately distinct training_types rows sharing
-- column_key='MED_TRAIN' (id 4 "Med Recert", id 5 "Initial Med Training").
-- Collapsing them into one would destroy per-row history. Fixing this
-- requires a product decision (rename one column_key, or keep the key
-- non-unique and rely on other disambiguators). Tracked for follow-up.

DROP INDEX IF EXISTS public.idx_employees_unique_name;
