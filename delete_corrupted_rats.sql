-- Deletar RATs corrompidas para depois inserir do backup
BEGIN;

-- Mostrar quantas serão deletadas
SELECT 'RATs que serão deletadas: ' || COUNT(*) as info
FROM rats 
WHERE status = 'completa' 
  AND (form_data IS NULL OR form_data = '{}');

-- Deletar
DELETE FROM rats 
WHERE status = 'completa' 
  AND (form_data IS NULL OR form_data = '{}');

COMMIT;

-- Verificar
SELECT 'RATs restantes completas: ' || COUNT(*) as info FROM rats WHERE status = 'completa';
