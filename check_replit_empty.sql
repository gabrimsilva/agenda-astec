-- Verificar quantas RATs vazias no Replit
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as sem_dados,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as com_dados
FROM rats 
WHERE status = 'completa';

-- Listar algumas RATs sem dados no Replit
SELECT 
  report_number,
  client_name,
  updated_at::date,
  CASE WHEN form_data IS NULL THEN 'NULL' ELSE 'VAZIO {}' END as tipo_vazio
FROM rats 
WHERE status = 'completa' 
  AND (form_data IS NULL OR form_data = '{}')
ORDER BY updated_at DESC
LIMIT 15;
