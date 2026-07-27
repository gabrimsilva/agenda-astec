-- Primeiro ver quantas serão excluídas
SELECT COUNT(*) as total 
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL;

-- Excluir as atividades
DELETE FROM activities
WHERE id IN (
  SELECT a.id
  FROM activities a
  LEFT JOIN rats r ON r.activity_id = a.id
  WHERE a.status = 'concluido'
    AND a.work_completed = true
    AND a.scheduled_date <= '2026-02-23 23:59:59'
    AND r.id IS NULL
);

-- Confirmar exclusão
SELECT COUNT(*) as restantes_antigas
FROM activities 
WHERE status = 'concluido'
  AND work_completed = true
  AND scheduled_date <= '2026-02-23 23:59:59';
