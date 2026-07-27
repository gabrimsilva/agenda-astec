-- Buscar QUALQUER atividade multi-dia do técnico (userId: e040c984-1f46-41a0-bdd7-a572ba185233)
-- Primeiro encontrar o technician_id
SELECT 
  a.id,
  a.title,
  a.client_name,
  to_char(a.scheduled_date, 'YYYY-MM-DD') as start_date,
  to_char(a.end_date, 'YYYY-MM-DD') as end_date,
  a.status
FROM activities a
INNER JOIN technicians t ON a.technician_id = t.id
WHERE t.user_id = 'e040c984-1f46-41a0-bdd7-a572ba185233'
  AND a.end_date IS NOT NULL
ORDER BY a.scheduled_date DESC
LIMIT 5;
