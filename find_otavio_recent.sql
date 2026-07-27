-- Atividades mais recentes do Otavio
SELECT 
  id, 
  title, 
  client_name, 
  to_char(scheduled_date, 'YYYY-MM-DD') as start_date,
  to_char(end_date, 'YYYY-MM-DD') as end_date,
  status,
  to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created
FROM activities 
WHERE technician_id = (SELECT id FROM technicians WHERE name ILIKE '%Otavio Bezerra%') 
ORDER BY created_at DESC 
LIMIT 5;
