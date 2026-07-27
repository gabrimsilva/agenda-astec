-- Buscar atividades multi-dia do Otavio (07/07 a 10/07)
SELECT 
  a.id,
  a.title,
  a.client_name,
  to_char(a.scheduled_date, 'YYYY-MM-DD') as start_date,
  to_char(a.end_date, 'YYYY-MM-DD') as end_date,
  a.status,
  t.name as technician_name
FROM activities a
INNER JOIN technicians t ON a.technician_id = t.id
WHERE t.name ILIKE '%Otavio%'
  AND a.end_date IS NOT NULL
  AND a.scheduled_date >= '2026-07-07'
  AND a.scheduled_date <= '2026-07-10'
ORDER BY a.scheduled_date;
