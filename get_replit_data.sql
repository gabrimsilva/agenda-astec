-- Buscar dados completos da RAT no Replit
SELECT 
  id,
  form_data,
  LENGTH(form_data::text) as tamanho
FROM rats 
WHERE report_number = 'RAT-2026-0334'
  AND form_data IS NOT NULL 
  AND form_data != '{}';
