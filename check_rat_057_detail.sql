-- Ver conteúdo do form_data da RAT 057-26
SELECT 
  id,
  report_number_manual,
  form_data,
  imported_pdf_url,
  imported_pdf_filename
FROM rats 
WHERE id = '6be0499c-b779-44cd-a174-dd71dbd09efc';
