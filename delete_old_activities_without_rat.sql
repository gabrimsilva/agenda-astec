-- Script para excluir atividades concluídas antigas (até 23/02/2026) que não têm RAT associada
-- Execute este script no banco de dados PostgreSQL

-- Primeiro, vamos ver quais atividades serão excluídas (para conferir)
SELECT 
  a.id,
  a.client_name,
  a.scheduled_date,
  a.status,
  a.work_completed,
  at.name as activity_type
FROM activities a
LEFT JOIN activity_types at ON a.activity_type_id = at.id
LEFT JOIN rats r ON r.activity_id = a.id
WHERE 
  a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL -- Não tem RAT associada
ORDER BY a.scheduled_date DESC;

-- Se estiver tudo OK, descomente e execute o DELETE abaixo:
-- 
-- DELETE FROM activities
-- WHERE id IN (
--   SELECT a.id
--   FROM activities a
--   LEFT JOIN rats r ON r.activity_id = a.id
--   WHERE 
--     a.status = 'concluido'
--     AND a.work_completed = true
--     AND a.scheduled_date <= '2026-02-23 23:59:59'
--     AND r.id IS NULL
-- );
-- 
-- -- Verificar quantas foram excluídas
-- SELECT COUNT(*) as atividades_excluidas FROM activities WHERE scheduled_date <= '2026-02-23 23:59:59' AND status = 'concluido';
