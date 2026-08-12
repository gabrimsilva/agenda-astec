-- Buscar RAT 057-26
SELECT 
  id,
  report_number,
  report_number_manual,
  client_name,
  status,
  CASE 
    WHEN form_data IS NULL THEN 'NULL'
    WHEN form_data = '{}' THEN 'EMPTY'
    ELSE 'HAS DATA'
  END as form_status,
  sent_at,
  LENGTH(form_data::text) as form_size,
  imported_pdf_url IS NOT NULL as has_pdf
FROM rats 
WHERE report_number LIKE '%057-26%' 
   OR report_number_manual LIKE '%057-26%';
