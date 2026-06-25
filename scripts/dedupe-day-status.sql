-- Remove duplicate activity_day_status rows per (activity_id, date),
-- keeping the most relevant one: concluido first, then the one with a checkout, then most recently updated.
DELETE FROM activity_day_status
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY activity_id, date
        ORDER BY
          (status = 'concluido') DESC,
          check_out_time DESC NULLS LAST,
          check_in_time DESC NULLS LAST,
          updated_at DESC
      ) AS rn
    FROM activity_day_status
  ) t
  WHERE t.rn > 1
);

-- Prevent future duplicates
ALTER TABLE activity_day_status
  ADD CONSTRAINT activity_day_status_activity_date_unique UNIQUE (activity_id, date);
