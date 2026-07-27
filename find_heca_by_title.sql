-- Buscar atividade pelo título exato
SELECT 
  a.id,
  a.title,
  a.client_name,
  to_char(a.scheduled_date, 'YYYY-MM-DD HH24:MI') as start_datetime,
  to_char(a.end_date, 'YYYY-MM-DD HH24:MI') as end_datetime,
  a.status,
  t.name as technician_name,
  a.description
FROM activities a
LEFT JOIN technicians t ON a.technician_id = t.id
WHERE a.title ILIKE '%Acompanhamento técnico%pintura%RETHANE%'
  AND a.client_name ILIKE '%HECA%'
ORDER BY a.created_at DESC
LIMIT 3;
