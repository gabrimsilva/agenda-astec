-- Consultar quantas RATs vazias da produção têm dados no Replit
\echo 'Consultando Replit para RATs recuperáveis...'
\echo ''

SELECT 
  COUNT(*) as total_recuperaveis,
  MIN(updated_at)::date as primeira_atualizacao,
  MAX(updated_at)::date as ultima_atualizacao
FROM rats 
WHERE id IN (
  SELECT id::uuid FROM (VALUES
    ('e80dbdb3-ff48-429c-9317-c5a532e3d44e'),
    ('47e3cc51-6d3e-4be6-bb0c-47233cb3c06e'),
    ('41d94e93-c47e-43b3-9a05-ea8e6592b95a'),
    ('280b9952-b433-47c7-b8ba-9a04e2453f19'),
    ('093d8cf4-19ce-43f6-87c8-4604049f5e9f'),
    ('7a7cf38f-48f0-4284-8a89-3332f0d5fcd5'),
    ('2065579c-263d-4f33-b14e-7e292d5cca69'),
    ('18273661-1f8b-411f-9b37-36e21db72d88')
  ) AS t(id)
)
AND form_data IS NOT NULL 
AND form_data != '{}';

\echo ''
\echo 'Listando primeiras 10 RATs recuperáveis:'
\echo ''

SELECT 
  report_number as numero_rat,
  client_name as cliente,
  LENGTH(form_data::text) as tamanho_dados,
  updated_at::date as atualizada_em
FROM rats 
WHERE id IN (
  SELECT id::uuid FROM (VALUES
    ('e80dbdb3-ff48-429c-9317-c5a532e3d44e'),
    ('47e3cc51-6d3e-4be6-bb0c-47233cb3c06e'),
    ('41d94e93-c47e-43b3-9a05-ea8e6592b95a'),
    ('280b9952-b433-47c7-b8ba-9a04e2453f19'),
    ('093d8cf4-19ce-43f6-87c8-4604049f5e9f'),
    ('7a7cf38f-48f0-4284-8a89-3332f0d5fcd5'),
    ('2065579c-263d-4f33-b14e-7e292d5cca69'),
    ('18273661-1f8b-411f-9b37-36e21db72d88')
  ) AS t(id)
)
AND form_data IS NOT NULL 
AND form_data != '{}'
ORDER BY updated_at DESC
LIMIT 10;
