-- Per (employee, training) winning completion across all sources, with
-- the source attribution preserved. Used by:
--   - The employee detail page to show "this date came from PHS on Sep 12"
--   - The compliance calculator as a faster lookup than the LATERAL
--     subquery in employee_compliance
--   - The resolution review UI to show what happens to historical records
--     after an alias is added
--
-- "Winning" rule: latest completion_date wins. Ties broken by source
-- preference (paylocity > phs > access > signin > manual > auto_fill)
-- because Paylocity is HR's official record of completion. Then by
-- training_records.created_at DESC as the final tiebreak.

CREATE OR REPLACE VIEW master_completions AS
SELECT DISTINCT ON (tr.employee_id, tr.training_type_id)
  tr.employee_id,
  tr.training_type_id,
  tr.completion_date,
  tr.expiration_date,
  tr.source,
  tr.id AS training_record_id,
  tr.created_at AS recorded_at
FROM training_records tr
ORDER BY
  tr.employee_id,
  tr.training_type_id,
  tr.completion_date DESC,
  CASE tr.source
    WHEN 'paylocity'              THEN 1
    WHEN 'phs'                    THEN 2
    WHEN 'access'                 THEN 3
    WHEN 'signin'                 THEN 4
    WHEN 'training_records_sheet' THEN 4
    WHEN 'manual'                 THEN 5
    WHEN 'merged_sheet'           THEN 6
    WHEN 'auto_fill'              THEN 7
    ELSE 99
  END ASC,
  tr.created_at DESC;

COMMENT ON VIEW master_completions IS
  'Winning training_records row per (employee, training). Latest date wins, '
  'ties broken by source preference (paylocity > phs > access > signin > '
  'manual > auto_fill).';
