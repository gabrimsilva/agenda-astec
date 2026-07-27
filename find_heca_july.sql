SELECT 
  id, 
  title, 
  client_name,
  to_char(scheduled_date, 'YYYY-MM-DD') as start_date,
  to_char(end_date, 'YYYY-MM-DD') as end_date,
  status
FROM activities 
WHERE client_name ILIKE '%HECA%' 
  AND scheduled_date >= '2026-07-01' 
  AND scheduled_date <= '2026-07-31'
ORDER BY scheduled_date;
