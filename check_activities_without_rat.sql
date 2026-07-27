-- Check specific activities from the screenshot to see if they have RATs
-- Activities shown: Volcan service (25/02/2026), STOCK MINAS GOIÁS LTDA (23/02/2026), etc.

SELECT 
  a.id as activity_id,
  a.client_name,
  a.scheduled_date,
  a.status,
  a.work_completed,
  at.name as activity_type,
  r.id as rat_id,
  r.report_number,
  r.status as rat_status,
  r.created_at as rat_created_at
FROM activities a
LEFT JOIN activity_types at ON a.activity_type_id = at.id
LEFT JOIN rats r ON r.activity_id = a.id
WHERE 
  a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date >= '2026-02-01'
  AND a.scheduled_date <= '2026-02-28'
  AND (
    a.client_name LIKE '%Volcan%' 
    OR a.client_name LIKE '%STOCK MINAS%'
    OR a.client_name LIKE '%AÇO MOITA%'
    OR a.client_name LIKE '%ENGENHARIA EIRELI%'
    OR a.client_name LIKE '%Steelmast%'
  )
ORDER BY a.scheduled_date DESC;

-- Count all completed activities without RATs in February 2026
SELECT 
  COUNT(*) as total_activities_without_rat
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE 
  a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date >= '2026-02-01'
  AND a.scheduled_date <= '2026-02-28'
  AND r.id IS NULL;

-- Show all activities without RAT grouped by activity type
SELECT 
  at.name as activity_type,
  COUNT(*) as count_without_rat
FROM activities a
LEFT JOIN activity_types at ON a.activity_type_id = at.id
LEFT JOIN rats r ON r.activity_id = a.id
WHERE 
  a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date >= '2026-02-01'
  AND a.scheduled_date <= '2026-02-28'
  AND r.id IS NULL
GROUP BY at.name
ORDER BY count_without_rat DESC;
