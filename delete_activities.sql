-- Excluir atividades do perfil Administrador dos dias 12 e 13 de agosto de 2026
-- Técnico: Administrador (ID: 1b146bbb-50a4-412a-8092-7cb731cbe6dc)

BEGIN;

-- Mostrar atividades que serão excluídas
SELECT id, client_name, scheduled_date, end_date
FROM activities 
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND scheduled_date::date >= '2026-08-12' 
  AND scheduled_date::date <= '2026-08-13';

-- 1. Excluir time_entries relacionados
DELETE FROM time_entries
WHERE agenda_activity_id IN (
  SELECT id FROM activities 
  WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
    AND scheduled_date::date >= '2026-08-12' 
    AND scheduled_date::date <= '2026-08-13'
);

-- 2. Excluir activity_time_records relacionados
DELETE FROM activity_time_records
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
    AND scheduled_date::date >= '2026-08-12' 
    AND scheduled_date::date <= '2026-08-13'
);

-- 3. Excluir activity_day_status relacionados
DELETE FROM activity_day_status
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
    AND scheduled_date::date >= '2026-08-12' 
    AND scheduled_date::date <= '2026-08-13'
);

-- 4. Excluir RATs relacionadas
DELETE FROM rats
WHERE activity_id IN (
  SELECT id FROM activities 
  WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
    AND scheduled_date::date >= '2026-08-12' 
    AND scheduled_date::date <= '2026-08-13'
);

-- 5. Finalmente, excluir as atividades
DELETE FROM activities
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND scheduled_date::date >= '2026-08-12' 
  AND scheduled_date::date <= '2026-08-13';

COMMIT;

-- Verificar quantas atividades restam nesses dias
SELECT COUNT(*) as total_remaining
FROM activities 
WHERE scheduled_date::date >= '2026-08-12' 
  AND scheduled_date::date <= '2026-08-13';
