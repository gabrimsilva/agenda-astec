\t
\a
\o /tmp/prod_empty_ids_clean.txt
SELECT id FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}');
\o
\! wc -l /tmp/prod_empty_ids_clean.txt
