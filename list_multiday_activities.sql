-- Listar todas as atividades multi-dia entre 05/07 e 11/07
SELECT 
  id,
  title,
  client_name,
  scheduled_date,
  end_date,
  technician_id,
  status
FROM activities 
WHERE end_date IS NOT NULL  -- Multi-dia
  AND scheduled_date >= '2026-07-05'
  AND scheduled_date <= '2026-07-11'
ORDER BY scheduled_date, start_time;
