-- Excluir time_entries órfãos do Administrador (01/08 a 12/08/2026)
-- Técnico: Administrador (ID: 1b146bbb-50a4-412a-8092-7cb731cbe6dc)

BEGIN;

-- Primeiro, vamos ver quais são os registros
SELECT id, work_date, minutes, category, source, notes
FROM time_entries
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND work_date::date >= '2026-08-01'
  AND work_date::date <= '2026-08-13'
ORDER BY work_date, created_at;

-- Excluir os time_entries do Administrador nesse período
DELETE FROM time_entries
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND work_date::date >= '2026-08-01'
  AND work_date::date <= '2026-08-13';

COMMIT;

-- Verificar se ainda restam registros
SELECT COUNT(*) as remaining_entries
FROM time_entries
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND work_date::date >= '2026-08-01'
  AND work_date::date <= '2026-08-13';
