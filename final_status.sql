-- Status final após recuperação
SELECT 
  COUNT(*) as total_rats,
  COUNT(CASE WHEN status = 'completa' THEN 1 END) as completas,
  COUNT(CASE WHEN status = 'completa' AND form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as completas_com_dados,
  COUNT(CASE WHEN status = 'completa' AND (form_data IS NULL OR form_data = '{}') THEN 1 END) as completas_vazias
FROM rats;
