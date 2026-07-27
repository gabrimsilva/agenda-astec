-- Script para comparar RATs vazias da produção com Replit
-- Lista IDs de RATs que estão vazias na produção
\o /tmp/prod_empty_ids.txt
SELECT id FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}');
\o
\! echo "Total de RATs vazias na produção:" && wc -l /tmp/prod_empty_ids.txt
