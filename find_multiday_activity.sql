-- Buscar atividades multi-dia do técnico nesse período
SELECT 
  id,
  title,
  client_name,
  start_time,
  end_date,
  status,
  technician_id
FROM activities
WHERE end_date IS NOT NULL
  AND start_time >= '2026-07-07'
  AND end_date <= '2026-07-10 23:59:59'
  AND client_name = 'HECA CONSTRUTORA LTDA'
ORDER BY start_time;
