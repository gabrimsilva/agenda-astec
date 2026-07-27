-- Excluir todos os registros relacionados à atividade multi-dia
-- 1. Excluir time entries primeiro (foreign key)
DELETE FROM time_entries 
WHERE agenda_activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067';

-- 2. Excluir day statuses
DELETE FROM activity_day_status 
WHERE activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067';

-- 3. Excluir time records
DELETE FROM activity_time_records 
WHERE activity_id = '29cfa228-1182-4d7c-9b40-f92b01295067';

-- 4. Excluir a atividade
DELETE FROM activities 
WHERE id = '29cfa228-1182-4d7c-9b40-f92b01295067';

-- Verificar se foi excluída
SELECT COUNT(*) as count FROM activities WHERE id = '29cfa228-1182-4d7c-9b40-f92b01295067';
