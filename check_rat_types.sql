-- Verificar tipos de RATs com checkbox marcado (enviadas)
SELECT 
  'PDF IMPORTADO' as tipo,
  COUNT(*) as total,
  COUNT(CASE WHEN form_data IS NULL THEN 1 END) as null_data,
  COUNT(CASE WHEN form_data = '{}' THEN 1 END) as empty_data,
  AVG(LENGTH(form_data::text)) as avg_size
FROM rats 
WHERE sent_at IS NOT NULL 
  AND imported_pdf_url IS NOT NULL

UNION ALL

SELECT 
  'MANUAL COMPLETA' as tipo,
  COUNT(*) as total,
  COUNT(CASE WHEN form_data IS NULL THEN 1 END) as null_data,
  COUNT(CASE WHEN form_data = '{}' THEN 1 END) as empty_data,
  AVG(LENGTH(form_data::text)) as avg_size
FROM rats 
WHERE sent_at IS NOT NULL 
  AND imported_pdf_url IS NULL
  AND is_simplified = false

UNION ALL

SELECT 
  'MANUAL SIMPLIFICADA' as tipo,
  COUNT(*) as total,
  COUNT(CASE WHEN form_data IS NULL THEN 1 END) as null_data,
  COUNT(CASE WHEN form_data = '{}' THEN 1 END) as empty_data,
  AVG(LENGTH(form_data::text)) as avg_size
FROM rats 
WHERE sent_at IS NOT NULL 
  AND imported_pdf_url IS NULL
  AND is_simplified = true;

-- Ver exemplo de cada tipo
SELECT 
  'PDF IMPORTADO' as tipo,
  report_number_manual,
  CASE 
    WHEN form_data IS NULL THEN 'NULL'
    WHEN form_data = '{}' THEN 'EMPTY'
    ELSE 'HAS DATA'
  END as status_data,
  LENGTH(form_data::text) as size
FROM rats 
WHERE sent_at IS NOT NULL 
  AND imported_pdf_url IS NOT NULL
LIMIT 3

UNION ALL

SELECT 
  'MANUAL' as tipo,
  report_number_manual,
  CASE 
    WHEN form_data IS NULL THEN 'NULL'
    WHEN form_data = '{}' THEN 'EMPTY'
    ELSE 'HAS DATA'
  END as status_data,
  LENGTH(form_data::text) as size
FROM rats 
WHERE sent_at IS NOT NULL 
  AND imported_pdf_url IS NULL
LIMIT 3;
