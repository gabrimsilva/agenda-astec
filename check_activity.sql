-- Verificar atividade e seu tipo
SELECT 
  a.id,
  a.client_name,
  a.scheduled_date,
  a.end_date,
  a.activity_type_id,
  at.name as activity_type_name,
  at.requires_rat,
  at.parent_id
FROM activities a
JOIN activity_types at ON at.id = a.activity_type_id
WHERE a.id = '19fb6097-96e6-4c1a-9a43-f7c5b9ed07a5';

-- Verificar day statuses
SELECT date, status, work_completed, check_out_time
FROM activity_day_status
WHERE activity_id = '19fb6097-96e6-4c1a-9a43-f7c5b9ed07a5'
ORDER BY date;

-- Verificar se RAT existe
SELECT id, status, created_at
FROM rats
WHERE activity_id = '19fb6097-96e6-4c1a-9a43-f7c5b9ed07a5';
