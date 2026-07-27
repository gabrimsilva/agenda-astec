-- Criar tabela temporária para IDs  
CREATE TEMP TABLE prod_empty_ids (id text);

-- Importar IDs do arquivo
\copy prod_empty_ids FROM '/tmp/prod_empty_ids_clean.txt'

-- Consultar quantas dessas RATs têm dados no Replit
SELECT 
  COUNT(*) as total_recuperaveis,
  COUNT(CASE WHEN LENGTH(form_data::text) > 100 THEN 1 END) as com_dados_substanciais
FROM rats 
WHERE id IN (SELECT id FROM prod_empty_ids)
  AND form_data IS NOT NULL 
  AND form_data != '{}';

-- Listar algumas RATs recuperáveis
SELECT 
  report_number,
  client_name,
  LENGTH(form_data::text) as tamanho_dados,
  updated_at::date
FROM rats 
WHERE id IN (SELECT id FROM prod_empty_ids)
  AND form_data IS NOT NULL 
  AND form_data != '{}'
ORDER BY updated_at DESC
LIMIT 15;
