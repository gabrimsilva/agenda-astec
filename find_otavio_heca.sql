-- Buscar atividade do Otavio Bezerra da Silva com HECA
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
WHERE t.name ILIKE '%Otavio Bezerra%'
  AND a.client_name ILIKE '%HECA%'
ORDER BY a.scheduled_date DESC
LIMIT 5;
