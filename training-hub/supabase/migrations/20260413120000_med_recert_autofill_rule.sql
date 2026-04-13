-- Add auto-fill rule so Initial Med Training populates Med Recert on the same day.
-- Backfills existing Initial Med Training rows that have no matching Med Recert.
-- Also deletes the 3025-07-01 Jessica Logsdon Mealtime typo row (duplicate of the
-- existing 2025-07-01 access row).

-- A. Remove the Mealtime typo row (3025-07-01).
DELETE FROM training_records
WHERE id = '899ca8a3-8081-49fa-9da3-4ba3d54b9abc'
  AND completion_date = DATE '3025-07-01';

-- B. Add Initial Med Training (5) -> Med Recert (4) rule, offset 0 days.
INSERT INTO auto_fill_rules (source_type_id, target_type_id, offset_days)
SELECT 5, 4, 0
WHERE NOT EXISTS (
  SELECT 1 FROM auto_fill_rules
  WHERE source_type_id = 5 AND target_type_id = 4
);

-- C. Backfill Med Recert rows for every employee that has an Initial Med Training
--    but no Med Recert on the same completion date. Expiration defaults to +3 years
--    to match training_types.renewal_years for Med Recert.
INSERT INTO training_records (employee_id, training_type_id, completion_date, expiration_date, source)
SELECT DISTINCT
       imt.employee_id,
       4 AS training_type_id,
       imt.completion_date,
       (imt.completion_date + INTERVAL '3 years')::date AS expiration_date,
       'auto_fill' AS source
FROM training_records imt
WHERE imt.training_type_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM training_records mr
    WHERE mr.employee_id = imt.employee_id
      AND mr.training_type_id = 4
      AND mr.completion_date = imt.completion_date
  )
ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;
