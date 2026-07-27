-- Verificar reagendamentos no período
SELECT * FROM activity_reschedules 
WHERE new_date >= '2026-07-07' 
  AND new_date <= '2026-07-10';
