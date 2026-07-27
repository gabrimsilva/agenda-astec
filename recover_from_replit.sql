-- Recuperar RAT-2026-0334 do Replit

-- 1. Buscar ID da RAT vazia na produção
SELECT 'Encontrando RAT vazia na produção...' as status;
SELECT id, report_number, client_name, 
       CASE WHEN form_data IS NULL THEN 'NULL' 
            WHEN form_data = '{}' THEN 'VAZIO' 
            ELSE 'COM DADOS' END as status_dados
FROM rats 
WHERE report_number = 'RAT-2026-0334';
