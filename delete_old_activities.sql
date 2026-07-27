-- 1. Ver quantas atividades serão excluídas
SELECT COUNT(*) as total_para_excluir
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL;

-- 2. Listar as atividades (primeiras 20)
SELECT 
  a.id,
  a.client_name,
  TO_CHAR(a.scheduled_date, 'DD/MM/YYYY') as data,
  a.status
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL
ORDER BY a.scheduled_date DESC
LIMIT 20;

-- 3. EXCLUIR (descomente para executar)
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

-- 4. Confirmar exclusão
SELECT COUNT(*) as atividades_antigas_restantes
FROM activities 
WHERE status = 'concluido'
  AND scheduled_date <= '2026-02-23 23:59:59';
