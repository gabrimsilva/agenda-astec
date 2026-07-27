-- Resetar dia 7 para concluído (estado original)
UPDATE activity_day_status 
SET status = 'concluido', updated_at = NOW() 
WHERE activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067' 
AND date = '2026-07-07 00:00:00';

-- Resetar dia 8 para planejado
UPDATE activity_day_status 
SET status = 'planejado', updated_at = NOW() 
WHERE activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067' 
AND date = '2026-07-08 00:00:00';

-- Verificar resultado
SELECT date, status, updated_at 
FROM activity_day_status 
WHERE activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067' 
ORDER BY date;
